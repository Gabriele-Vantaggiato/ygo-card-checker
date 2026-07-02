import { openDatabase } from './database';

const name = process.argv[2] ?? 'Galaxy Expedition';
const db = openDatabase();

const cards = db
  .prepare(`SELECT id, name, archetype FROM cards WHERE name LIKE ?`)
  .all(`%${name}%`) as Array<{ id: number; name: string; archetype: string | null }>;

console.log('matches:', cards);

for (const card of cards) {
  const rel = db
    .prepare(
      `SELECT relation, score, (SELECT name FROM cards WHERE id = target_id) AS target
       FROM card_relations WHERE source_id = ? ORDER BY score DESC LIMIT 10`,
    )
    .all(card.id);
  const tags = db.prepare('SELECT tag FROM card_tags WHERE card_id = ?').all(card.id);
  console.log(`\n${card.name} (#${card.id})`);
  console.log('  tags:', tags);
  console.log('  relations:', rel);
}

db.close();
