import assert from 'node:assert/strict';
import { parseCardEffects, parseTributeSpecialSummon } from './effect-parser';

const attackReflectorUnit =
  'Tribute 1 "Cyber Dragon". Special Summon 1 "Cyber Barrier Dragon" from your hand or Deck.';

const tributePayoff = parseTributeSpecialSummon(attackReflectorUnit);
assert.equal(tributePayoff?.kind, 'tribute_special_summon');
assert.deepEqual(tributePayoff?.tributeNames, ['Cyber Dragon']);
assert.deepEqual(tributePayoff?.summonNames, ['Cyber Barrier Dragon']);

const parsed = parseCardEffects(attackReflectorUnit);
assert.ok(parsed.payoffs.some((payoff) => payoff.kind === 'tribute_special_summon'));
assert.ok(parsed.payoffs.some((payoff) => payoff.kind === 'special_summon_deck'));

console.log('effect-parser.test.ts OK');
