import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, openDatabase, readMeta, REPO_ROOT } from './database';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'related.json');
const MAX_RELATED_PER_CARD = 12;

interface RelatedRow {
  source_id: number;
  target_id: number;
  relation: string;
  score: number;
  target_name: string;
  target_archetype: string | null;
  target_tcg_date: string | null;
  target_ban_tcg: string | null;
}

interface ExportedRelated {
  id: number;
  name: string;
  relation: string;
  score: number;
  archetype: string | null;
  tcgDate: string | null;
  banTcg: string | null;
  imageSmall: string;
}

interface ExportedCardEntry {
  tags: string[];
  series: string[];
  related: ExportedRelated[];
}

interface ExportPayload {
  version: number;
  generatedAt: string;
  cardCount: number;
  entries: Record<string, ExportedCardEntry>;
}

async function main(): Promise<void> {
  const db = openDatabase();
  const meta = readMeta();

  const rows = db
    .prepare(
      `SELECT
        r.source_id,
        r.target_id,
        r.relation,
        r.score,
        c.name AS target_name,
        c.archetype AS target_archetype,
        c.tcg_date AS target_tcg_date,
        c.ban_tcg AS target_ban_tcg
      FROM card_relations r
      JOIN cards c ON c.id = r.target_id
      ORDER BY r.source_id, r.score DESC, c.name ASC`,
    )
    .all() as RelatedRow[];

  const tagRows = db
    .prepare('SELECT card_id, tag FROM card_tags WHERE source = ?')
    .all('rule') as Array<{ card_id: number; tag: string }>;

  const seriesRows = db
    .prepare(
      `SELECT id, archetype FROM cards WHERE archetype IS NOT NULL AND archetype != ''`,
    )
    .all() as Array<{ id: number; archetype: string }>;

  db.close();

  const tagsByCard = new Map<number, string[]>();
  for (const row of tagRows) {
    const bucket = tagsByCard.get(row.card_id) ?? [];
    bucket.push(row.tag);
    tagsByCard.set(row.card_id, bucket);
  }

  const seriesByCard = new Map<number, string[]>();
  for (const row of seriesRows) {
    seriesByCard.set(row.id, [row.archetype]);
  }
  for (const [cardId, tags] of tagsByCard) {
    const series = new Set(seriesByCard.get(cardId) ?? []);
    if (tags.includes('mentions_photon')) {
      series.add('Photon');
    }
    if (tags.includes('mentions_galaxy')) {
      series.add('Galaxy');
      series.add('Galaxy-Eyes');
    }
    if (series.size > 0) {
      seriesByCard.set(cardId, [...series]);
    }
  }

  const entries: Record<string, ExportedCardEntry> = {};
  for (const row of rows) {
    const key = String(row.source_id);
    const entry = entries[key] ?? { tags: tagsByCard.get(row.source_id) ?? [], series: seriesByCard.get(row.source_id) ?? [], related: [] };
    if (entry.related.length >= MAX_RELATED_PER_CARD) {
      entries[key] = entry;
      continue;
    }
    entry.related.push({
      id: row.target_id,
      name: row.target_name,
      relation: row.relation,
      score: row.score,
      archetype: row.target_archetype,
      tcgDate: row.target_tcg_date,
      banTcg: row.target_ban_tcg,
      imageSmall: `https://images.ygoprodeck.com/images/cards_small/${row.target_id}.jpg`,
    });
    entries[key] = entry;
  }

  for (const [cardId, tags] of tagsByCard) {
    const key = String(cardId);
    if (!entries[key]) {
      entries[key] = {
        tags,
        series: seriesByCard.get(cardId) ?? [],
        related: [],
      };
    }
  }

  const payload: ExportPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    cardCount: meta?.totalCards ?? Object.keys(entries).length,
    entries,
  };

  mkdirSync(join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge'), { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(payload), 'utf8');

  const sizeMb = (Buffer.byteLength(JSON.stringify(payload)) / (1024 * 1024)).toFixed(2);
  console.log(`Exported ${Object.keys(entries).length} card entries → ${EXPORT_PATH}`);
  console.log(`Approx size: ${sizeMb} MB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
