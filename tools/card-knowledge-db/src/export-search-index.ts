import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, readMeta, REPO_ROOT } from './database';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'search-index.json');

interface SearchIndexEntry {
  id: number;
  name: string;
  type: string;
  race: string | null;
  attribute: string | null;
  level: number | null;
  atk: number | null;
  def: number | null;
  archetype: string | null;
  desc: string;
  tags: string[];
}

async function main(): Promise<void> {
  const db = openDatabase();
  const meta = readMeta();

  const rows = db
    .prepare(
      `SELECT id, name, type, race, attribute, level, atk, def, archetype, desc_en, babel_strings_json
       FROM cards
       ORDER BY id`,
    )
    .all() as Array<{
    id: number;
    name: string;
    type: string;
    race: string | null;
    attribute: string | null;
    level: number | null;
    atk: number | null;
    def: number | null;
    archetype: string | null;
    desc_en: string;
    babel_strings_json: string | null;
  }>;

  const categoryTagRows = db
    .prepare(`SELECT card_id, tag FROM card_tags WHERE source = 'category'`)
    .all() as Array<{ card_id: number; tag: string }>;

  db.close();

  const tagsByCard = new Map<number, string[]>();
  for (const row of categoryTagRows) {
    const bucket = tagsByCard.get(row.card_id) ?? [];
    bucket.push(row.tag);
    tagsByCard.set(row.card_id, bucket);
  }

  const entries: SearchIndexEntry[] = rows.map((row) => {
    const babelStrings: string[] = row.babel_strings_json ? JSON.parse(row.babel_strings_json) : [];
    // Append BabelCDB's per-effect-option text fragments so search matches
    // discrete effect clauses too, not just the full desc_en prose.
    const desc = babelStrings.length > 0 ? `${row.desc_en} ${babelStrings.join(' ')}` : row.desc_en;
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      race: row.race,
      attribute: row.attribute,
      level: row.level,
      atk: row.atk,
      def: row.def,
      archetype: row.archetype,
      desc,
      tags: tagsByCard.get(row.id) ?? [],
    };
  });

  mkdirSync(join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge'), { recursive: true });
  const json = JSON.stringify(entries);
  writeFileSync(EXPORT_PATH, json, 'utf8');

  const sizeMb = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(2);
  console.log(`Exported ${entries.length} search index entries → ${EXPORT_PATH}`);
  console.log(`Approx size: ${sizeMb} MB (cards.db meta: ${meta?.totalCards ?? 'unknown'} total)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
