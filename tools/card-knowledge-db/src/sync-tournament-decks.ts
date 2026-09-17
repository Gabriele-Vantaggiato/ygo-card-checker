/**
 * Builds a card-pair co-occurrence table (EDHRec-style: "these cards actually appear
 * together in real decks") from ygoprodeck.com's public deck database API
 * (`/api/decks/getDecks.php`) — a clean, structured, paginated JSON endpoint (main_deck/
 * extra_deck/side_deck as arrays of numeric card passcodes), discovered from the deck-search
 * page's own client-side JS. No bulk decklist API is documented, but this one exists and
 * needs no HTML/text parsing at all — card identity is the passcode, nothing is guessed.
 *
 * Filtered to the site's "Tournament Meta Decks" categories (via `_sft_category`, also
 * discovered from the deck-search page's own filter dropdown) instead of a generic
 * popularity sort: real YCS/Regional/WCQ results (tournamentName/tournamentPlacement are
 * populated for many of these), not old casual/meme decks mixed in by view count.
 *
 * Respectful of the site: sequential requests with a delay between them, well under the
 * documented API rate limit. `scraped_decks` (keyed by deckNum) makes re-runs idempotent.
 */
import { DB_PATH, openDatabase, runInTransaction } from './database';

const API_URL = 'https://ygoprodeck.com/api/decks/getDecks.php';
const PAGE_SIZE = 20; // server-enforced cap regardless of requested limit
const REQUEST_DELAY_MS = 500;
const USER_AGENT = 'Mozilla/5.0 (compatible; ygo-card-checker knowledge sync; +local)';
const CATEGORIES = [
  'Tournament Meta Decks',
  'Tournament Meta Decks OCG',
  'Tournament Meta Decks Worlds',
  'world championship decks',
];
const categoryArg = process.argv.find((arg) => arg.startsWith('--category='));
const categories = categoryArg ? [categoryArg.split('=').slice(1).join('=')] : CATEGORIES;

interface DeckApiRow {
  deckNum: number;
  main_deck: string; // JSON-encoded string[] of passcodes
  extra_deck: string;
  side_deck: string;
}

const maxPagesArg = process.argv.find((arg) => arg.startsWith('--max-pages='));
const maxPages = maxPagesArg ? Number(maxPagesArg.split('=')[1]) : 20;
const startOffsetArg = process.argv.find((arg) => arg.startsWith('--start-offset='));
const startOffset = startOffsetArg ? Number(startOffsetArg.split('=')[1]) : 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(category: string, offset: number): Promise<DeckApiRow[] | null> {
  const url = `${API_URL}?sort=Deck%20Views&limit=${PAGE_SIZE}&offset=${offset}&_sft_category=${encodeURIComponent(category)}`;
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
      console.warn(`  HTTP ${response.status} at offset ${offset}`);
      return null;
    }
    return (await response.json()) as DeckApiRow[];
  } catch (error) {
    console.warn(`  Fetch failed at offset ${offset}: ${(error as Error).message}`);
    return null;
  }
}

function parseCardIds(jsonArray: string | null | undefined): number[] {
  if (!jsonArray) {
    return [];
  }
  try {
    const ids = JSON.parse(jsonArray) as string[];
    return ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return [];
  }
}

function recordCooccurrence(pairWeights: Map<string, number>, cardIds: readonly number[]): void {
  const unique = [...new Set(cardIds)];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = Math.min(unique[i], unique[j]);
      const b = Math.max(unique[i], unique[j]);
      const key = `${a}:${b}`;
      pairWeights.set(key, (pairWeights.get(key) ?? 0) + 1);
    }
  }
}

async function main(): Promise<void> {
  console.log('Sync real decklist co-occurrence → card knowledge DB');
  console.log(`Output: ${DB_PATH}`);

  const db = openDatabase();
  const alreadyScraped = new Set(
    (db.prepare('SELECT slug FROM scraped_decks').all() as Array<{ slug: string }>).map(
      (row) => row.slug,
    ),
  );

  const pairWeights = new Map<string, number>();
  const scrapedNow: string[] = [];
  let decksWithData = 0;

  for (const category of categories) {
    console.log(`\nCategory: ${category}`);
    for (let page = 0; page < maxPages; page++) {
      const offset = startOffset + page * PAGE_SIZE;
      process.stdout.write(
        `\r  page ${page + 1}/${maxPages} (offset=${offset}), decks used so far: ${decksWithData}`.padEnd(90),
      );
      const rows = await fetchPage(category, offset);
      await sleep(REQUEST_DELAY_MS);
      if (!rows || rows.length === 0) {
        console.log('\n  No more decks in this category — moving on.');
        break;
      }

      for (const row of rows) {
        const key = String(row.deckNum);
        if (alreadyScraped.has(key)) {
          continue;
        }
        const cardIds = [
          ...parseCardIds(row.main_deck),
          ...parseCardIds(row.extra_deck),
          ...parseCardIds(row.side_deck),
        ];
        if (cardIds.length > 0) {
          recordCooccurrence(pairWeights, cardIds);
          decksWithData++;
        }
        alreadyScraped.add(key);
        scrapedNow.push(key);
      }
    }
  }
  console.log('');

  console.log(`Writing ${pairWeights.size} co-occurring pair(s) from ${decksWithData} deck(s)...`);
  runInTransaction(db, () => {
    const upsert = db.prepare(`
      INSERT INTO deck_cooccurrence (card_a, card_b, deck_count)
      VALUES (?, ?, ?)
      ON CONFLICT (card_a, card_b) DO UPDATE SET deck_count = deck_count + excluded.deck_count
    `);
    for (const [key, weight] of pairWeights) {
      const [a, b] = key.split(':').map(Number);
      upsert.run(a, b, weight);
    }

    const markScraped = db.prepare(
      'INSERT OR REPLACE INTO scraped_decks (slug, scraped_at) VALUES (?, ?)',
    );
    const scrapedAt = new Date().toISOString();
    for (const key of scrapedNow) {
      markScraped.run(key, scrapedAt);
    }
  });

  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
