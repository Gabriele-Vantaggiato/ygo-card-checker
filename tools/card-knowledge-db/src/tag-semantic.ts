import type { DatabaseSync } from 'node:sqlite';
import { RuleBasedCardSemanticParser } from './semantic-parser';
import { LlmCardSemanticParser, RATE_LIMIT_DELAY_MS } from './semantic-parser-llm';
import { listCardsForTagging, openDatabase, runInTransaction, upsertSemanticProfile } from './database';

type TaggableCard = ReturnType<typeof listCardsForTagging>[number];

const USE_LLM = process.argv.includes('--source=llm');

function runRuleBased(db: DatabaseSync, cards: TaggableCard[]): void {
  const parser = new RuleBasedCardSemanticParser();
  console.log(`Building semantic profiles for ${cards.length} cards...`);
  let withRoles = 0;

  runInTransaction(db, () => {
    for (const card of cards) {
      const profile = parser.parse({
        name: card.name,
        archetype: card.archetype,
        descEn: card.desc_en,
        descIt: card.desc_it,
        mentions: card.mentions,
      });
      upsertSemanticProfile(db, card.id, profile);
      if (profile.roles.length > 0) {
        withRoles += 1;
      }
    }
  });

  console.log(`Done. ${withRoles} cards with at least one role assigned.`);
}

async function runLlm(db: DatabaseSync, cards: TaggableCard[]): Promise<void> {
  // Skip cards already LLM-parsed so reruns don't re-pay for them.
  const alreadyDone = new Set(
    (db.prepare(`SELECT card_id FROM card_semantic_profile WHERE source = ?`).all('llm') as Array<{
      card_id: number;
    }>).map((row) => row.card_id),
  );
  const pending = cards.filter((card) => !alreadyDone.has(card.id));

  console.log(
    `Building LLM semantic profiles for ${pending.length} cards (${alreadyDone.size} already LLM-tagged, skipped)...`,
  );

  const parser = new LlmCardSemanticParser();
  let successes = 0;
  let failures = 0;

  for (const card of pending) {
    try {
      const profile = await parser.parseAsync({
        name: card.name,
        archetype: card.archetype,
        descEn: card.desc_en,
        descIt: card.desc_it,
        mentions: card.mentions,
      });
      upsertSemanticProfile(db, card.id, profile, 'llm');
      successes += 1;
    } catch (error) {
      failures += 1;
      console.warn(
        `[tag-semantic] LLM parse failed for card "${card.name}" (id=${card.id}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
  }

  console.log(`Done. ${successes} succeeded, ${failures} failed (${alreadyDone.size} skipped, already LLM-tagged).`);
}

async function main(): Promise<void> {
  const db = openDatabase();
  const cards = listCardsForTagging(db);
  if (cards.length === 0) {
    console.error('No cards in DB. Run: npm run db:sync');
    process.exit(1);
  }

  if (USE_LLM) {
    await runLlm(db, cards);
  } else {
    runRuleBased(db, cards);
  }

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
