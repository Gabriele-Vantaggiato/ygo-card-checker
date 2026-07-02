import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { SyncMeta, YgoProDeckCard } from './types';

const TOOL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = join(TOOL_ROOT, '..', '..');
export const DATA_DIR = join(REPO_ROOT, 'data', 'card-knowledge');
export const DB_PATH = join(DATA_DIR, 'cards.db');
export const META_PATH = join(DATA_DIR, 'meta.json');
export const SCHEMA_PATH = join(TOOL_ROOT, 'schema.sql');

export function openDatabase(): DatabaseSync {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

export function upsertCard(db: DatabaseSync, card: YgoProDeckCard, descIt: string | null): void {
  const syncedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO cards (
      id, name, type, race, attribute, level, archetype,
      desc_en, desc_it, atk, def, tcg_date, ban_tcg, synced_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
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
): Array<{ id: number; name: string; archetype: string | null; desc_en: string; desc_it: string | null }> {
  return db
    .prepare('SELECT id, name, archetype, desc_en, desc_it FROM cards ORDER BY id')
    .all() as Array<{
    id: number;
    name: string;
    archetype: string | null;
    desc_en: string;
    desc_it: string | null;
  }>;
}
