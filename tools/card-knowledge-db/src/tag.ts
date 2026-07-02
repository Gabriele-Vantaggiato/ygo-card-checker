import { detectMechanicTags } from './mechanic-tags';
import { listCardDescs, openDatabase, replaceRuleTags, runInTransaction } from './database';

async function main(): Promise<void> {
  const db = openDatabase();
  const cards = listCardDescs(db);
  if (cards.length === 0) {
    console.error('No cards in DB. Run: npm run db:sync');
    process.exit(1);
  }

  console.log(`Tagging ${cards.length} cards (rule engine)...`);
  let tagged = 0;

  runInTransaction(db, () => {
    for (const card of cards) {
      const tags = detectMechanicTags(card.desc_en);
      if (card.desc_it) {
        for (const tag of detectMechanicTags(card.desc_it)) {
          if (!tags.includes(tag)) {
            tags.push(tag);
          }
        }
      }
      replaceRuleTags(db, card.id, tags);
      if (tags.length > 0) {
        tagged += 1;
      }
    }
  });

  db.close();
  console.log(`Done. ${tagged} cards with at least one tag.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
