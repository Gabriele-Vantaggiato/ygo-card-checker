import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, openDatabase, runInTransaction } from './database';

/**
 * BabelCDB (ProjectIgnis) ships the official OCG/TCG card database as a sqlite
 * file keyed by konami passcode — the same id space YGOPRODeck uses. Its
 * `setcode` column carries the real archetype/series membership (up to 4
 * packed 16-bit codes), which is far more reliable than matching on the
 * free-text `archetype` string or name substrings. We only use it to enrich
 * cards we already carry (no new cards are introduced from this source).
 */
const CDB_URL = 'https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/master/cards.cdb';
const CACHE_DIR = join(DATA_DIR, 'babel-cache');
const CACHE_PATH = join(CACHE_DIR, 'cards.cdb');

interface BabelDataRow {
  id: number;
  setcode: string;
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
    .prepare('SELECT id, CAST(setcode AS TEXT) AS setcode FROM datas')
    .all() as unknown as BabelDataRow[];
  babel.close();

  const db = openDatabase();
  const existingIds = new Set(
    (db.prepare('SELECT id FROM cards').all() as Array<{ id: number }>).map((r) => r.id),
  );

  const update = db.prepare('UPDATE cards SET setcode_json = ? WHERE id = ?');

  let matched = 0;
  let updated = 0;
  runInTransaction(db, () => {
    for (const row of rows) {
      if (!existingIds.has(row.id)) {
        continue;
      }
      matched += 1;
      const codes = decodeSetcode(row.setcode);
      if (codes.length === 0) {
        continue;
      }
      update.run(JSON.stringify(codes), row.id);
      updated += 1;
    }
  });

  db.close();
  console.log(
    `BabelCDB: ${rows.length} official cards read, ${matched} matched our catalog, ${updated} got a setcode.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
