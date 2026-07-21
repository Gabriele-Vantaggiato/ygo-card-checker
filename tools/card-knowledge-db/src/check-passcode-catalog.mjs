import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const db = new DatabaseSync('data/card-knowledge/cards.db', { readOnly: true });
const dbCount = db.prepare('SELECT COUNT(*) AS c FROM cards').get().c;
const typeRows = db
  .prepare('SELECT type AS t, COUNT(*) AS c FROM cards GROUP BY type ORDER BY c DESC')
  .all();

const cat = JSON.parse(readFileSync('src/assets/data/passcode-catalog.json', 'utf8'));
const catIds = new Set(cat.cards.map((c) => c.i));
const missing = db.prepare('SELECT id, name, type FROM cards').all().filter((r) => !catIds.has(r.id));
const extra = cat.cards.filter((c) => !db.prepare('SELECT 1 FROM cards WHERE id = ?').get(c.i));

const spellTypes = typeRows.filter((r) => /spell|trap/i.test(r.t));
console.log(
  JSON.stringify(
    {
      dbCount,
      catalogCount: cat.cards.length,
      missing: missing.length,
      missingSample: missing.slice(0, 8),
      extra: extra.length,
      spellTrapTypes: spellTypes,
    },
    null,
    2,
  ),
);
