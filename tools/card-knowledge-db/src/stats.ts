import {
  countRelations,
  countTags,
  DB_PATH,
  openDatabase,
  readMeta,
} from './database';

async function main(): Promise<void> {
  const meta = readMeta();
  const db = openDatabase();

  const cards = (db.prepare('SELECT COUNT(*) AS c FROM cards').get() as { c: number }).c;
  const archetypes = (
    db.prepare('SELECT COUNT(DISTINCT archetype) AS c FROM cards WHERE archetype IS NOT NULL').get() as {
      c: number;
    }
  ).c;
  const tags = countTags(db);
  const relations = countRelations(db);

  const topTags = db
    .prepare(`SELECT tag, COUNT(*) AS c FROM card_tags GROUP BY tag ORDER BY c DESC LIMIT 10`)
    .all() as Array<{ tag: string; c: number }>;

  db.close();

  console.log('Card knowledge DB stats');
  console.log(`  Path:       ${DB_PATH}`);
  console.log(`  Cards:      ${cards}`);
  console.log(`  Archetypes: ${archetypes}`);
  console.log(`  Tags:       ${tags}`);
  console.log(`  Relations:  ${relations}`);
  if (meta) {
    console.log(`  Last sync:  ${meta.syncedAt}`);
    console.log(`  Languages:  ${meta.languages.join(', ')}`);
  }
  if (topTags.length > 0) {
    console.log('  Top tags:');
    for (const row of topTags) {
      console.log(`    - ${row.tag}: ${row.c}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
