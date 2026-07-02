import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { deriveCardFrame } from './card-frame';
import type { StructuredEffect } from './effect-parser';
import type { SyncMeta, YgoProDeckCard } from './types';

const TOOL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = join(TOOL_ROOT, '..', '..');
export const DATA_DIR = join(REPO_ROOT, 'data', 'card-knowledge');
export const DB_PATH = join(DATA_DIR, 'cards.db');
export const META_PATH = join(DATA_DIR, 'meta.json');
export const SCHEMA_PATH = join(TOOL_ROOT, 'schema.sql');

const CARD_COLUMN_MIGRATIONS = [
  'ALTER TABLE cards ADD COLUMN frame_type TEXT',
  'ALTER TABLE cards ADD COLUMN link_val INTEGER',
  'ALTER TABLE cards ADD COLUMN pendulum_scale INTEGER',
  'ALTER TABLE cards ADD COLUMN is_extra_deck INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE cards ADD COLUMN ban_goat TEXT',
  'ALTER TABLE cards ADD COLUMN formats_json TEXT',
] as const;

function migrateCardTagsSource(db: DatabaseSync): void {
  try {
    db.prepare(
      `INSERT INTO card_tags (card_id, tag, confidence, source, created_at)
       VALUES (-1, '__format_source_probe__', 1.0, 'format', '1970-01-01T00:00:00.000Z')`,
    ).run();
    db.prepare(`DELETE FROM card_tags WHERE card_id = -1 AND tag = '__format_source_probe__'`).run();
  } catch {
    db.exec(`
      CREATE TABLE card_tags_migrated (
        card_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        source TEXT NOT NULL CHECK (source IN ('rule', 'llm', 'manual', 'format')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (card_id, tag, source),
        FOREIGN KEY (card_id) REFERENCES cards(id)
      );
      INSERT INTO card_tags_migrated SELECT * FROM card_tags;
      DROP TABLE card_tags;
      ALTER TABLE card_tags_migrated RENAME TO card_tags;
      CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag);
    `);
  }
}

function migrateDatabase(db: DatabaseSync): void {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(cards)').all() as Array<{ name: string }>).map((row) => row.name),
  );
  for (const statement of CARD_COLUMN_MIGRATIONS) {
    const column = statement.match(/ADD COLUMN (\w+)/)?.[1];
    if (column && !columns.has(column)) {
      db.exec(statement);
    }
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_cards_frame_type ON cards(frame_type)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_format_legality (
      card_id INTEGER NOT NULL,
      format_id TEXT NOT NULL,
      in_pool INTEGER NOT NULL,
      ban_status TEXT NOT NULL,
      max_copies INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      computed_at TEXT NOT NULL,
      PRIMARY KEY (card_id, format_id),
      FOREIGN KEY (card_id) REFERENCES cards(id)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_cfl_format_verdict ON card_format_legality(format_id, verdict)');
  migrateCardTagsSource(db);
}

export function openDatabase(): DatabaseSync {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  migrateDatabase(db);
  return db;
}

export function upsertCard(db: DatabaseSync, card: YgoProDeckCard, descIt: string | null): void {
  const syncedAt = new Date().toISOString();
  const frame = deriveCardFrame(card);

  db.prepare(
    `INSERT INTO cards (
      id, name, type, race, attribute, level, archetype,
      desc_en, desc_it, atk, def, tcg_date, ban_tcg, ban_goat, formats_json,
      frame_type, link_val, pendulum_scale, is_extra_deck, synced_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      race = excluded.race,
      attribute = excluded.attribute,
      level = excluded.level,
      archetype = excluded.archetype,
      desc_en = excluded.desc_en,
      desc_it = COALESCE(excluded.desc_it, cards.desc_it),
      atk = excluded.atk,
      def = excluded.def,
      tcg_date = excluded.tcg_date,
      ban_tcg = excluded.ban_tcg,
      ban_goat = excluded.ban_goat,
      formats_json = excluded.formats_json,
      frame_type = excluded.frame_type,
      link_val = excluded.link_val,
      pendulum_scale = excluded.pendulum_scale,
      is_extra_deck = excluded.is_extra_deck,
      synced_at = excluded.synced_at`,
  ).run(
    card.id,
    card.name,
    card.type,
    card.race ?? null,
    card.attribute ?? null,
    card.level ?? null,
    card.archetype ?? null,
    card.desc,
    descIt,
    card.atk ?? null,
    card.def ?? null,
    card.misc_info?.[0]?.tcg_date ?? null,
    card.banlist_info?.ban_tcg ?? null,
    card.banlist_info?.ban_goat ?? null,
    card.misc_info?.[0]?.formats ? JSON.stringify(card.misc_info[0].formats) : null,
    frame.frameType,
    frame.linkVal,
    frame.pendulumScale,
    frame.isExtraDeck ? 1 : 0,
    syncedAt,
  );
}

export function replaceRuleTags(db: DatabaseSync, cardId: number, tags: string[]): void {
  db.prepare(`DELETE FROM card_tags WHERE card_id = ? AND source = 'rule'`).run(cardId);
  const insert = db.prepare(
    `INSERT INTO card_tags (card_id, tag, confidence, source, created_at)
     VALUES (?, ?, 1.0, 'rule', ?)`,
  );
  const now = new Date().toISOString();
  for (const tag of tags) {
    insert.run(cardId, tag, now);
  }
}

export function replaceCardEffects(db: DatabaseSync, cardId: number, effects: StructuredEffect[]): void {
  db.prepare(`DELETE FROM card_effects WHERE card_id = ? AND source = 'rule'`).run(cardId);
  const insert = db.prepare(
    `INSERT INTO card_effects (card_id, effect_kind, payload_json, source, created_at)
     VALUES (?, ?, ?, 'rule', ?)`,
  );
  const now = new Date().toISOString();
  for (const effect of effects) {
    insert.run(cardId, effect.kind, JSON.stringify(effect), now);
  }
}

export function replaceCardMentions(db: DatabaseSync, cardId: number, mentions: string[]): void {
  db.prepare(`DELETE FROM card_mentions WHERE card_id = ? AND source = 'rule'`).run(cardId);
  const insert = db.prepare(
    `INSERT INTO card_mentions (card_id, mention, source, created_at)
     VALUES (?, ?, 'rule', ?)`,
  );
  const now = new Date().toISOString();
  for (const mention of mentions) {
    insert.run(cardId, mention, now);
  }
}

export function writeMeta(meta: SyncMeta): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
}

export function readMeta(): SyncMeta | null {
  try {
    return JSON.parse(readFileSync(META_PATH, 'utf8')) as SyncMeta;
  } catch {
    return null;
  }
}

export function countTags(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM card_tags').get() as { c: number }).c;
}

export function countRelations(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM card_relations').get() as { c: number }).c;
}

export function countEffects(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM card_effects').get() as { c: number }).c;
}

export function countMentions(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM card_mentions').get() as { c: number }).c;
}

export function countFormatLegality(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM card_format_legality').get() as { c: number }).c;
}

export function countFormatTags(db: DatabaseSync): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM card_tags WHERE source = 'format'`).get() as { c: number })
    .c;
}

export function insertRelation(
  db: DatabaseSync,
  sourceId: number,
  targetId: number,
  relation: string,
  score: number,
): void {
  db.prepare(
    `INSERT INTO card_relations (source_id, target_id, relation, score, method, created_at)
     VALUES (?, ?, ?, ?, 'rule', ?)
     ON CONFLICT(source_id, target_id, relation, method) DO UPDATE SET
       score = excluded.score,
       created_at = excluded.created_at`,
  ).run(sourceId, targetId, relation, score, new Date().toISOString());
}

export function clearRuleRelations(db: DatabaseSync): void {
  db.prepare(`DELETE FROM card_relations WHERE method = 'rule'`).run();
}

export function runInTransaction(db: DatabaseSync, fn: () => void): void {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function listCardsForTagging(
  db: DatabaseSync,
): Array<{
  id: number;
  name: string;
  archetype: string | null;
  desc_en: string;
  desc_it: string | null;
  mentions: string[];
}> {
  const cards = db
    .prepare('SELECT id, name, archetype, desc_en, desc_it FROM cards ORDER BY id')
    .all() as Array<{
    id: number;
    name: string;
    archetype: string | null;
    desc_en: string;
    desc_it: string | null;
  }>;

  const mentionRows = db.prepare('SELECT card_id, mention FROM card_mentions WHERE source = ?').all('rule') as Array<{
    card_id: number;
    mention: string;
  }>;
  const mentionsByCard = new Map<number, string[]>();
  for (const row of mentionRows) {
    const bucket = mentionsByCard.get(row.card_id) ?? [];
    bucket.push(row.mention);
    mentionsByCard.set(row.card_id, bucket);
  }

  return cards.map((card) => ({
    ...card,
    mentions: mentionsByCard.get(card.id) ?? [],
  }));
}

export function listCardsForParsing(
  db: DatabaseSync,
): Array<{ id: number; desc_en: string; desc_it: string | null }> {
  return db.prepare('SELECT id, desc_en, desc_it FROM cards ORDER BY id').all() as Array<{
    id: number;
    desc_en: string;
    desc_it: string | null;
  }>;
}

export function loadEffectsByCard(db: DatabaseSync): Map<number, StructuredEffect[]> {
  const rows = db
    .prepare('SELECT card_id, payload_json FROM card_effects WHERE source = ?')
    .all('rule') as Array<{ card_id: number; payload_json: string }>;

  const map = new Map<number, StructuredEffect[]>();
  for (const row of rows) {
    const effect = JSON.parse(row.payload_json) as StructuredEffect;
    const bucket = map.get(row.card_id) ?? [];
    bucket.push(effect);
    map.set(row.card_id, bucket);
  }
  return map;
}

export function loadParsedEffectsForCard(
  effectsByCard: Map<number, StructuredEffect[]>,
  cardId: number,
): { requirements: StructuredEffect[]; payoffs: StructuredEffect[]; effects: StructuredEffect[] } {
  const effects = effectsByCard.get(cardId) ?? [];
  return {
    requirements: effects.filter((e) => e.kind === 'control'),
    payoffs: effects.filter((e) => e.kind !== 'control'),
    effects,
  };
}
