import { ENGINE_SEEDS } from './combo-engines-data';
import {
  clearComboEngines,
  clearComboFlows,
  insertComboEngineCard,
  openDatabase,
  runInTransaction,
  upsertComboEngine,
} from './database';

async function main(): Promise<void> {
  const db = openDatabase();
  const cards = db.prepare('SELECT id, name FROM cards').all() as Array<{ id: number; name: string }>;
  const idByName = new Map(cards.map((card) => [card.name.toLowerCase(), card.id]));

  console.log(`Building ${ENGINE_SEEDS.length} combo engines...`);
  let linkedCards = 0;
  let missing = 0;

  runInTransaction(db, () => {
    // combo_flows.engine_id FK-references combo_engines(id); rebuilding engines
    // (new AUTOINCREMENT ids) invalidates any flows built against the old ones.
    // Run npm run db:combo-flows again afterward to relink them.
    clearComboFlows(db);
    clearComboEngines(db);

    for (const seed of ENGINE_SEEDS) {
      const engineId = upsertComboEngine(db, {
        key: seed.key,
        name: seed.name,
        description: seed.description,
        minCardsThreshold: seed.minCardsThreshold,
      });

      for (const cardSeed of seed.cards) {
        const cardId = idByName.get(cardSeed.name.toLowerCase());
        if (!cardId) {
          console.warn(`  [${seed.key}] card not found in DB: "${cardSeed.name}"`);
          missing += 1;
          continue;
        }
        insertComboEngineCard(db, engineId, cardId, cardSeed.role, cardSeed.minCopies);
        linkedCards += 1;
      }
    }
  });

  db.close();
  console.log(`Done. ${linkedCards} engine-card links, ${missing} unresolved names.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
