import assert from 'node:assert/strict';
import {
  extractQuotedNames,
  parseCardEffects,
  parseTributeSpecialSummon,
  seriesNamesForCard,
} from './effect-parser';

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

assert.deepEqual(extractQuotedNames(`Add "Magicians' Souls" from your Deck.`), ["Magicians' Souls"]);
assert.deepEqual(extractQuotedNames(`Your opponent's monster and "Target" gain ATK.`), ['Target']);
assert.deepEqual(extractQuotedNames('Add “Target” or “Target” from your Deck.'), ['Target']);
assert.deepEqual(extractQuotedNames("Your opponent's monster's original ATK."), []);

// "Galaxy-Eyes Photon Dragon" is the Galaxy-Eyes archetype, NOT the unrelated 2008
// "Photon" archetype (2008 Cyber Dragon support) that just happens to share the word
// "Photon" — tagging it into that series pulls the entire unrelated 40-card Photon
// roster (e.g. Cyber Laser Dragon) into Galaxy-Eyes deck suggestions.
const galaxyEyesPhotonDragonSeries = seriesNamesForCard({
  name: 'Galaxy-Eyes Photon Dragon',
  archetype: 'Galaxy-Eyes',
});
assert.deepEqual(new Set(galaxyEyesPhotonDragonSeries), new Set(['Galaxy-Eyes', 'Galaxy']));

// A card actually named/archetyped "Photon" still correctly gets the Photon series.
const photonThrasherSeries = seriesNamesForCard({ name: 'Photon Thrasher', archetype: 'Photon' });
assert.ok(photonThrasherSeries.includes('Photon'));

console.log('effect-parser.test.ts: seriesNamesForCard OK');
