import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Slim passcode → name/type/banlist catalog for the portable SPA overlay.
 * Full card text still comes from YGOPRODeck in the UI language; this file
 * makes passcode OCR → first paint nearly instant (O(1) Map).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const dbPath = join(root, 'data/card-knowledge/cards.db');
const outPath = join(root, 'src/assets/data/passcode-catalog.json');

const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare('SELECT id, name, type, ban_tcg FROM cards').all() as Array<{
  id: number;
  name: string;
  type: string;
  ban_tcg: string | null;
}>;

const catalog = {
  v: 1,
  generatedAt: new Date().toISOString(),
  cards: rows.map((r) => ({
    i: r.id,
    n: r.name,
    t: r.type,
    ...(r.ban_tcg ? { b: r.ban_tcg } : {}),
  })),
};

mkdirSync(dirname(outPath), { recursive: true });
const json = JSON.stringify(catalog);
writeFileSync(outPath, json);
console.log(
  JSON.stringify({
    cards: catalog.cards.length,
    bytes: json.length,
    outPath,
  }),
);
