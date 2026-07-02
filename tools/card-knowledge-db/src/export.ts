import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, readMeta, REPO_ROOT } from './database';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'related.json');
const MAX_RELATED_PER_CARD = 16;
const MAX_PER_RELATION = 4;
const MAX_MENTIONS = 10;
const MAX_EFFECTS = 6;

const RELATION_PRIORITY = [
  'engine',
  'gy_synergy',
  'mentions_card',
  'shared_mention',
  'archetype',
  'series',
] as const;

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

interface ExportedEffect {
  kind: string;
  payload: Record<string, unknown>;
}

interface ExportedCardEntry {
  tags: string[];
  series: string[];
  mentions: string[];
  effects: ExportedEffect[];
  related: ExportedRelated[];
}

interface ExportPayload {
  version: number;
  generatedAt: string;
  cardCount: number;
  entries: Record<string, ExportedCardEntry>;
}

function pickDiversifiedRelated(rows: RelatedRow[]): ExportedRelated[] {
  const relationMap = new Map<string, RelatedRow[]>();

  for (const row of rows) {
    const bucket = relationMap.get(row.relation) ?? [];
    bucket.push(row);
    relationMap.set(row.relation, bucket);
  }

  const picked: ExportedRelated[] = [];

  for (const relation of RELATION_PRIORITY) {
    const bucket = relationMap.get(relation) ?? [];
    bucket.sort((a, b) => b.score - a.score || a.target_name.localeCompare(b.target_name));
    for (const row of bucket.slice(0, MAX_PER_RELATION)) {
      if (picked.length >= MAX_RELATED_PER_CARD) {
        return picked;
      }
      picked.push({
        id: row.target_id,
        name: row.target_name,
        relation: row.relation,
        score: row.score,
        archetype: row.target_archetype,
        tcgDate: row.target_tcg_date,
        banTcg: row.target_ban_tcg,
        imageSmall: `https://images.ygoprodeck.com/images/cards_small/${row.target_id}.jpg`,
      });
    }
  }

  for (const [relation, bucket] of relationMap) {
    if ((RELATION_PRIORITY as readonly string[]).includes(relation)) {
      continue;
    }
    for (const row of bucket.slice(0, 2)) {
      if (picked.length >= MAX_RELATED_PER_CARD) {
        return picked;
      }
      picked.push({
        id: row.target_id,
        name: row.target_name,
        relation: row.relation,
        score: row.score,
        archetype: row.target_archetype,
        tcgDate: row.target_tcg_date,
        banTcg: row.target_ban_tcg,
        imageSmall: `https://images.ygoprodeck.com/images/cards_small/${row.target_id}.jpg`,
      });
    }
  }

  return picked;
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
    .prepare('SELECT card_id, tag FROM card_tags WHERE source IN (?, ?)')
    .all('rule', 'format') as Array<{ card_id: number; tag: string }>;

  const seriesRows = db
    .prepare(`SELECT id, archetype FROM cards WHERE archetype IS NOT NULL AND archetype != ''`)
    .all() as Array<{ id: number; archetype: string }>;

  const mentionRows = db
    .prepare('SELECT card_id, mention FROM card_mentions WHERE source = ? ORDER BY mention ASC')
    .all('rule') as Array<{ card_id: number; mention: string }>;

  const effectRows = db
    .prepare('SELECT card_id, payload_json FROM card_effects WHERE source = ?')
    .all('rule') as Array<{ card_id: number; payload_json: string }>;

  db.close();

  const tagsByCard = new Map<number, string[]>();
  for (const row of tagRows) {
    const bucket = tagsByCard.get(row.card_id) ?? [];
    bucket.push(row.tag);
    tagsByCard.set(row.card_id, bucket);
  }

  const mentionsByCard = new Map<number, string[]>();
  for (const row of mentionRows) {
    const bucket = mentionsByCard.get(row.card_id) ?? [];
    if (!bucket.includes(row.mention)) {
      bucket.push(row.mention);
    }
    mentionsByCard.set(row.card_id, bucket);
  }

  const effectsByCard = new Map<number, ExportedEffect[]>();
  for (const row of effectRows) {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    const kind = String(payload.kind ?? 'unknown');
    const bucket = effectsByCard.get(row.card_id) ?? [];
    if (bucket.length < MAX_EFFECTS) {
      bucket.push({ kind, payload });
      effectsByCard.set(row.card_id, bucket);
    }
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

  const rowsBySource = new Map<number, RelatedRow[]>();
  for (const row of rows) {
    const bucket = rowsBySource.get(row.source_id) ?? [];
    bucket.push(row);
    rowsBySource.set(row.source_id, bucket);
  }

  const entries: Record<string, ExportedCardEntry> = {};
  const allCardIds = new Set<number>([
    ...tagsByCard.keys(),
    ...rowsBySource.keys(),
    ...mentionsByCard.keys(),
    ...effectsByCard.keys(),
  ]);

  for (const cardId of allCardIds) {
    const sourceRows = rowsBySource.get(cardId) ?? [];
    entries[String(cardId)] = {
      tags: tagsByCard.get(cardId) ?? [],
      series: seriesByCard.get(cardId) ?? [],
      mentions: (mentionsByCard.get(cardId) ?? []).slice(0, MAX_MENTIONS),
      effects: effectsByCard.get(cardId) ?? [],
      related: sourceRows.length > 0 ? pickDiversifiedRelated(sourceRows) : [],
    };
  }

  const payload: ExportPayload = {
    version: 2,
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
