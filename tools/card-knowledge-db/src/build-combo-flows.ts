import { FLOW_SEEDS } from './combo-flows-data';
import {
  clearComboFlows,
  insertComboFlowKeyCard,
  openDatabase,
  runInTransaction,
  upsertComboFlow,
} from './database';

async function main(): Promise<void> {
  const db = openDatabase();
  const cards = db.prepare('SELECT id, name FROM cards').all() as Array<{ id: number; name: string }>;
  const idByName = new Map(cards.map((card) => [card.name.toLowerCase(), card.id]));
  const engineRows = db.prepare('SELECT id, key FROM combo_engines').all() as Array<{ id: number; key: string }>;
  const engineIdByKey = new Map(engineRows.map((row) => [row.key, row.id]));

  console.log(`Building ${FLOW_SEEDS.length} combo flows...`);
  let linkedKeyCards = 0;
  let missing = 0;

  runInTransaction(db, () => {
    clearComboFlows(db);

    for (const seed of FLOW_SEEDS) {
      const engineId = seed.engineKey ? (engineIdByKey.get(seed.engineKey) ?? null) : null;
      if (seed.engineKey && engineId === null) {
        console.warn(`  [${seed.key}] engine not found: "${seed.engineKey}" — run npm run db:combo-engines first`);
      }

      const flowId = upsertComboFlow(db, { key: seed.key, title: seed.title, engineId, steps: seed.steps });

      for (const cardName of seed.keyCardNames ?? []) {
        const cardId = idByName.get(cardName.toLowerCase());
        if (!cardId) {
          console.warn(`  [${seed.key}] card not found in DB: "${cardName}"`);
          missing += 1;
          continue;
        }
        insertComboFlowKeyCard(db, flowId, cardId);
        linkedKeyCards += 1;
      }
    }
  });

  db.close();
  console.log(`Done. ${linkedKeyCards} flow-key-card links, ${missing} unresolved names.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
