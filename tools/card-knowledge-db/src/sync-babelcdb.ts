import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, openDatabase, replaceCategoryTags, runInTransaction } from './database';
import { decodeCategoryTags } from './babel-category';

/**
 * BabelCDB (ProjectIgnis) ships the official OCG/TCG card database as a sqlite
 * file keyed by konami passcode — the same id space YGOPRODeck uses. We use it
 * to enrich cards we already carry (no new cards are introduced from this
 * source — BabelCDB has ~100 OCG/prerelease cards not yet on YGOPRODeck, left
 * out on purpose):
 *  - `setcode`: the real archetype/series membership (up to 4 packed 16-bit
 *    codes), more reliable than matching on the free-text `archetype` string.
 *  - `texts.str1..str16`: per-effect-option text fragments the game engine
 *    uses (segmented pieces of the full effect, e.g. "Special Summon 1 Level
 *    7 or lower Psychic monster..."), kept as `babel_strings_json` — useful
 *    search grain beyond the single `desc_en` blob.
 *  - `datas.category`: a bitmask whose bit layout does NOT match the current
 *    upstream `constant.lua`; only bits verified by statistical correlation
 *    against official card scripts are decoded (see `babel-category.ts`).
 *    Unverified bits are dropped rather than guessed.
 */
const CDB_URL = 'https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/master/cards.cdb';
const CACHE_DIR = join(DATA_DIR, 'babel-cache');
const CACHE_PATH = join(CACHE_DIR, 'cards.cdb');

interface BabelDataRow {
  id: number;
  setcode: string;
  category: number | null;
  str1: string | null;
  str2: string | null;
  str3: string | null;
  str4: string | null;
  str5: string | null;
  str6: string | null;
  str7: string | null;
  str8: string | null;
  str9: string | null;
  str10: string | null;
  str11: string | null;
  str12: string | null;
  str13: string | null;
  str14: string | null;
  str15: string | null;
  str16: string | null;
}

function collectStrings(row: BabelDataRow): string[] {
  const strings: string[] = [];
  for (let i = 1; i <= 16; i += 1) {
    const value = row[`str${i}` as keyof BabelDataRow] as string | null;
    if (value && value.trim()) strings.push(value.trim());
  }
  return strings;
}

function decodeSetcode(raw: string): number[] {
  const codes: number[] = [];
  // setcode is a 64-bit field; some cards use all four 16-bit archetype
  // slots, which overflows a JS number, so we read it as TEXT and parse
  // via BigInt.
  const value = BigInt(raw);
  for (let i = 0; i < 4; i += 1) {
    const chunk = Number((value >> BigInt(i * 16)) & 0xffffn);
    if (chunk !== 0) {
      codes.push(chunk);
    }
  }
  return codes;
}

async function downloadCdb(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`Downloading BabelCDB cards.cdb from ${CDB_URL}…`);
  const res = await fetch(CDB_URL);
  if (!res.ok) {
    throw new Error(`Failed to download BabelCDB (${res.status} ${res.statusText})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(CACHE_PATH, buffer);
  console.log(`Saved ${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB → ${CACHE_PATH}`);
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  if (force || !existsSync(CACHE_PATH)) {
    await downloadCdb();
  } else {
    console.log(`Using cached BabelCDB at ${CACHE_PATH} (pass --force to redownload)`);
  }

  const babel = new DatabaseSync(CACHE_PATH, { readOnly: true });
  const rows = babel
    .prepare(
      `SELECT datas.id, CAST(datas.setcode AS TEXT) AS setcode, datas.category,
              texts.str1, texts.str2, texts.str3, texts.str4, texts.str5, texts.str6, texts.str7, texts.str8,
              texts.str9, texts.str10, texts.str11, texts.str12, texts.str13, texts.str14, texts.str15, texts.str16
       FROM datas JOIN texts ON texts.id = datas.id`,
    )
    .all() as unknown as BabelDataRow[];
  babel.close();

  const db = openDatabase();
  const existingIds = new Set(
    (db.prepare('SELECT id FROM cards').all() as Array<{ id: number }>).map((r) => r.id),
  );

  const update = db.prepare(
    'UPDATE cards SET setcode_json = ?, babel_category = ?, babel_strings_json = ? WHERE id = ?',
  );

  let matched = 0;
  let updated = 0;
  let tagged = 0;
  runInTransaction(db, () => {
    for (const row of rows) {
      if (!existingIds.has(row.id)) {
        continue;
      }
      matched += 1;
      const codes = decodeSetcode(row.setcode);
      const category = row.category ?? 0;
      const strings = collectStrings(row);
      update.run(JSON.stringify(codes), category, JSON.stringify(strings), row.id);
      if (codes.length > 0) updated += 1;

      const categoryTags = decodeCategoryTags(category);
      replaceCategoryTags(db, row.id, categoryTags);
      if (categoryTags.length > 0) tagged += 1;
    }
  });

  db.close();
  console.log(
    `BabelCDB: ${rows.length} official cards read, ${matched} matched our catalog, ${updated} got a setcode, ${tagged} got a verified category tag.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
