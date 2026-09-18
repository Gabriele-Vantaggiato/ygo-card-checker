/**
 * Pillar 5 data source: exports deck_cooccurrence (real tournament decklist co-occurrence,
 * populated by npm run db:sync:decks) as a per-card top-N synergy list. Previously computed
 * but never exported to the frontend — DeckRecommendationService.getSuggestions consumes this.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, REPO_ROOT } from './database';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'synergies.json');
const MAX_PARTNERS_PER_CARD = 40;
const MIN_DECK_COUNT = 2;

interface CooccurrenceRow {
  card_a: number;
  card_b: number;
  deck_count: number;
}

export interface ExportedSynergyPartner {
  cardId: number;
  deckCount: number;
}

interface SynergiesExport {
  version: number;
  generatedAt: string;
  totalDecks: number;
  partners: Record<string, ExportedSynergyPartner[]>;
}

async function main(): Promise<void> {
  const db = openDatabase();

  const rows = db
    .prepare('SELECT card_a, card_b, deck_count FROM deck_cooccurrence WHERE deck_count >= ?')
    .all(MIN_DECK_COUNT) as CooccurrenceRow[];

  const totalDecks = (db.prepare('SELECT COUNT(*) AS c FROM scraped_decks').get() as { c: number }).c;
  db.close();

  if (rows.length === 0) {
    console.error('No deck co-occurrence data. Run: npm run db:sync:decks');
    process.exit(1);
  }

  const byCard = new Map<number, ExportedSynergyPartner[]>();
  const addPartner = (from: number, to: number, deckCount: number): void => {
    const bucket = byCard.get(from) ?? [];
    bucket.push({ cardId: to, deckCount });
    byCard.set(from, bucket);
  };
  for (const row of rows) {
    addPartner(row.card_a, row.card_b, row.deck_count);
    addPartner(row.card_b, row.card_a, row.deck_count);
  }

  const partners: Record<string, ExportedSynergyPartner[]> = {};
  for (const [cardId, list] of byCard) {
    list.sort((a, b) => b.deckCount - a.deckCount);
    partners[String(cardId)] = list.slice(0, MAX_PARTNERS_PER_CARD);
  }

  const payload: SynergiesExport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalDecks,
    partners,
  };

  mkdirSync(join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge'), { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(payload), 'utf8');
  const sizeKb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(`Exported synergies for ${Object.keys(partners).length} cards (${totalDecks} decks) → ${EXPORT_PATH}`);
  console.log(`Approx size: ${sizeKb} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
