import { SYNERGY_PAIRS } from './mechanic-tags';
import { clearRuleRelations, insertRelation, openDatabase, runInTransaction } from './database';

interface TagIndex {
  card_id: number;
  tag: string;
}

async function main(): Promise<void> {
  const db = openDatabase();
  const tagRows = db
    .prepare('SELECT card_id, tag FROM card_tags WHERE source = ?')
    .all('rule') as TagIndex[];

  if (tagRows.length === 0) {
    console.error('No tags found. Run: npm run db:tag');
    process.exit(1);
  }

  const byTag = new Map<string, number[]>();
  for (const row of tagRows) {
    const bucket = byTag.get(row.tag) ?? [];
    bucket.push(row.card_id);
    byTag.set(row.tag, bucket);
  }

  console.log('Building rule-based relations...');
  let relations = 0;

  runInTransaction(db, () => {
    clearRuleRelations(db);
    for (const pair of SYNERGY_PAIRS) {
      const triggers = byTag.get(pair.trigger) ?? [];
      const responses = byTag.get(pair.response) ?? [];
      for (const sourceId of triggers) {
        for (const targetId of responses) {
          if (sourceId === targetId) {
            continue;
          }
          insertRelation(db, sourceId, targetId, pair.relation, 1.0);
          relations += 1;
        }
      }
    }
  });

  db.close();
  console.log(`Done. ${relations} relations stored.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
