import { fetchAllCards } from './ygoprodeck';
import { DB_PATH, openDatabase, runInTransaction, upsertCard, writeMeta } from './database';

const includeItalian = process.argv.includes('--it');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

async function main(): Promise<void> {
  console.log('Sync YGOProDeck → card knowledge DB');
  console.log(`Output: ${DB_PATH}`);

  const db = openDatabase();

  console.log('Fetching EN cards...');
  const cardsEn = await fetchAllCards(
    'en',
    (loaded, total) => {
      process.stdout.write(`\r  EN: ${loaded}/${total}`);
    },
    limit,
  );
  console.log('');

  let cardsIt = new Map<number, string>();
  if (includeItalian) {
    console.log('Fetching IT descriptions...');
    const cardsItList = await fetchAllCards(
      'it',
      (loaded, total) => {
        process.stdout.write(`\r  IT: ${loaded}/${total}`);
      },
      limit,
    );
    console.log('');
    cardsIt = new Map(cardsItList.map((card) => [card.id, card.desc]));
  }

  console.log(`Writing ${cardsEn.length} cards...`);
  runInTransaction(db, () => {
    for (const card of cardsEn) {
      upsertCard(db, card, cardsIt.get(card.id) ?? null);
    }
  });

  const syncedAt = new Date().toISOString();
  writeMeta({
    totalCards: cardsEn.length,
    syncedAt,
    apiVersion: 'v7',
    languages: includeItalian ? ['en', 'it'] : ['en'],
  });

  db.close();
  console.log(`Done. ${cardsEn.length} cards synced at ${syncedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
