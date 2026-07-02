import { deriveCardFrame } from './card-frame';
import { extractMentions, mergeParsedEffects, parseCardEffects } from './effect-parser';
import {
  listCardsForParsing,
  openDatabase,
  replaceCardEffects,
  replaceCardMentions,
  runInTransaction,
} from './database';

function backfillCardFrames(db: import('node:sqlite').DatabaseSync): number {
  const rows = db
    .prepare('SELECT id, type FROM cards WHERE frame_type IS NULL OR frame_type = ?')
    .all('') as Array<{ id: number; type: string }>;

  const update = db.prepare(
    `UPDATE cards SET frame_type = ?, link_val = ?, pendulum_scale = ?, is_extra_deck = ? WHERE id = ?`,
  );

  let updated = 0;
  for (const row of rows) {
    const frame = deriveCardFrame({ id: row.id, name: '', type: row.type, desc: '' });
    update.run(frame.frameType, frame.linkVal, frame.pendulumScale, frame.isExtraDeck ? 1 : 0, row.id);
    updated += 1;
  }
  return updated;
}

async function main(): Promise<void> {
  const db = openDatabase();
  const cards = listCardsForParsing(db);
  if (cards.length === 0) {
    console.error('No cards in DB. Run: npm run db:sync');
    process.exit(1);
  }

  const backfilled = backfillCardFrames(db);
  if (backfilled > 0) {
    console.log(`Backfilled frame metadata for ${backfilled} cards.`);
  }

  console.log(`Parsing effects for ${cards.length} cards...`);
  let withEffects = 0;
  let withMentions = 0;

  runInTransaction(db, () => {
    for (const card of cards) {
      const parsedEn = parseCardEffects(card.desc_en);
      const parsed =
        card.desc_it != null
          ? mergeParsedEffects(parsedEn, parseCardEffects(card.desc_it))
          : parsedEn;

      replaceCardEffects(db, card.id, parsed.effects);

      const mentions = new Set<string>([
        ...extractMentions(card.desc_en),
        ...(card.desc_it ? extractMentions(card.desc_it) : []),
      ]);
      replaceCardMentions(db, card.id, [...mentions]);

      if (parsed.effects.length > 0) {
        withEffects += 1;
      }
      if (mentions.size > 0) {
        withMentions += 1;
      }
    }
  });

  db.close();
  console.log(`Done. ${withEffects} cards with structured effects, ${withMentions} with mentions.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
