import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, readMeta, REPO_ROOT } from './database';
import { seriesNamesForCard } from './effect-parser';

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

interface ExportedRosterMember {
  id: number;
  name: string;
  type: string;
  archetype: string | null;
  tcgDate: string | null;
  banTcg: string | null;
  imageSmall: string;
}

interface ExportPayload {
  version: number;
  generatedAt: string;
  cardCount: number;
  entries: Record<string, ExportedCardEntry>;
  archetypes: Record<string, ExportedRosterMember[]>;
  seriesIndex: Record<string, ExportedRosterMember[]>;
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
    .prepare(
      `SELECT id, name, type, archetype, tcg_date, ban_tcg
       FROM cards
       WHERE archetype IS NOT NULL AND archetype != ''`,
    )
    .all() as Array<{
    id: number;
    name: string;
    type: string;
    archetype: string;
    tcg_date: string | null;
    ban_tcg: string | null;
  }>;

  const allCards = db
    .prepare(`SELECT id, name, type, archetype, tcg_date, ban_tcg FROM cards`)
    .all() as Array<{
    id: number;
    name: string;
    type: string;
    archetype: string | null;
    tcg_date: string | null;
    ban_tcg: string | null;
  }>;

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
  for (const card of allCards) {
    const series = new Set(seriesByCard.get(card.id) ?? []);
    for (const token of seriesNamesForCard({ name: card.name, archetype: card.archetype })) {
      series.add(token);
    }
    const tags = tagsByCard.get(card.id) ?? [];
    if (tags.includes('mentions_photon')) {
      series.add('Photon');
    }
    if (tags.includes('mentions_galaxy')) {
      series.add('Galaxy');
      series.add('Galaxy-Eyes');
    }
    if (series.size > 0) {
      seriesByCard.set(card.id, [...series]);
    }
  }

  const toRosterMember = (row: {
    id: number;
    name: string;
    type: string;
    archetype: string | null;
    tcg_date: string | null;
    ban_tcg: string | null;
  }): ExportedRosterMember => ({
    id: row.id,
    name: row.name,
    type: row.type,
    archetype: row.archetype,
    tcgDate: row.tcg_date,
    banTcg: row.ban_tcg,
    imageSmall: `https://images.ygoprodeck.com/images/cards_small/${row.id}.jpg`,
  });

  const archetypes: Record<string, ExportedRosterMember[]> = {};
  for (const row of seriesRows) {
    const bucket = archetypes[row.archetype] ?? [];
    bucket.push(toRosterMember(row));
    archetypes[row.archetype] = bucket;
  }
  for (const members of Object.values(archetypes)) {
    members.sort((a, b) => a.name.localeCompare(b.name));
  }

  const seriesIndex: Record<string, ExportedRosterMember[]> = {};
  for (const card of allCards) {
    const tokens = seriesNamesForCard({ name: card.name, archetype: card.archetype });
    const member = toRosterMember(card);
    for (const token of tokens) {
      const bucket = seriesIndex[token] ?? [];
      if (!bucket.some((entry) => entry.id === member.id)) {
        bucket.push(member);
        seriesIndex[token] = bucket;
      }
    }
  }
  for (const members of Object.values(seriesIndex)) {
    members.sort((a, b) => a.name.localeCompare(b.name));
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
    archetypes,
    seriesIndex,
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
