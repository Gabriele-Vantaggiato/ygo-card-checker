import assert from 'node:assert/strict';
import { RuleBasedCardSemanticParser } from './semantic-parser';

const parser = new RuleBasedCardSemanticParser();

// Handtrap: real PSCT text (as synced from YGOProDeck) — no literal "either player's
// turn" phrase, just "(Quick Effect)" + a hand-cost, which is the far more common pattern.
const ashBlossom = parser.parse({
  name: 'Ash Blossom & Joyous Spring',
  archetype: null,
  descIt: null,
  descEn:
    'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect.\r\n● Add a card from the Deck to the hand.\r\n● Special Summon from the Deck.\r\n● Send a card from the Deck to the GY.\r\nYou can only use this effect of "Ash Blossom & Joyous Spring" once per turn.',
});
assert.ok(ashBlossom.roles.includes('handtrap'), 'Ash Blossom should be tagged handtrap');
assert.ok(ashBlossom.triggers.includes('anytime'), 'Ash Blossom should trigger anytime');
assert.ok(ashBlossom.outcomes.includes('negate_effect'), 'Ash Blossom should have negate_effect outcome');

// Starter: searches the Deck, no control requirement.
const searcher = parser.parse({
  name: 'Generic Searcher',
  archetype: null,
  descIt: null,
  descEn: 'You can add 1 "Test" monster from your Deck to your hand.',
});
assert.ok(searcher.roles.includes('starter'), 'a plain searcher should be tagged starter');
assert.ok(searcher.outcomes.includes('search_deck'));

// Cost flags: discard as an explicit cost clause.
const costCard = parser.parse({
  name: 'Cost Card',
  archetype: null,
  descIt: null,
  descEn: 'Discard 1 card, then target 1 card on the field; destroy it.',
});
assert.equal(costCard.costFlags.discardsForCost, true);
assert.equal(costCard.costFlags.tributesForCost, false);

// Restrictions: attribute lock.
const darkLock = parser.parse({
  name: 'Dark Lock Card',
  archetype: null,
  descIt: null,
  descEn: 'You can only Special Summon "DARK" Attribute monsters from your Extra Deck.',
});
assert.equal(darkLock.restrictions.restrictsSummonToAttribute, 'DARK');

console.log('semantic-parser.test.ts OK');
