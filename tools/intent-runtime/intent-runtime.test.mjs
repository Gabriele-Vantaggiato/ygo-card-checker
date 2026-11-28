/** Run with Node 22+: npm run intent:test (no Angular install needed) */
import test from 'node:test';
import { interpretIntentAction } from '../../src/app/features/intent-runtime/intent-actions.ts';
import assert from 'node:assert/strict';
import { mainDeckSnapshot, simulateOpeningHands, deckFingerprint } from '../../src/app/features/intent-runtime/intent-simulator.ts';
import { defaultPanels, interpretWorkspaceRequest, readIntentStarters, validWorkspace } from '../../src/app/features/intent-runtime/intent-contract.ts';

const cards = [
  { id: 1, name: 'Starter', quantity: 1, imageUrlSmall: null },
  { id: 2, name: 'Other', quantity: 1, imageUrlSmall: null },
];
const run = (overrides = {}) => simulateOpeningHands({ cards, samples: 10_000, handSize: 1, starterIds: [1], seed: 42, ...overrides });

test('identical input and seed generate identical simulations', () => assert.deepEqual(run(), run()));
test('frequency and histogram counts are actual draws', () => {
  const result = run();
  assert.equal(result.starterDistribution.reduce((a, b) => a + b, 0), result.samples);
  assert.equal(result.appearances.reduce((a, b) => a + b.hits, 0), result.samples);
});
test('brick is defined by explicitly chosen starter cards', () => {
  assert.equal(run({ starterIds: [] }).brickRate, null);
  assert.ok(run().brickRate > 0.45 && run().brickRate < 0.55);
});
test('invalid or unsupported simulations are rejected', () => {
  assert.throws(() => run({ samples: 100_001 }), RangeError);
  assert.throws(() => run({ handSize: 3 }), RangeError);
});
test('only Main Deck cards are included, not Extra / Side', () => {
  const main = mainDeckSnapshot([
    { id: 10, name: 'Scrap', type: 'Effect Monster', quantity: 3, imageUrlSmall: null },
    { id: 11, name: 'Synchro', type: 'Synchro Monster', quantity: 1, imageUrlSmall: null },
    { id: 12, name: 'Side', type: 'Spell Card', section: 'side', quantity: 1, imageUrlSmall: null },
  ]);
  assert.equal(main.length, 1);
});
test('deck fingerprint is insensitive to card ordering', () => {
  assert.equal(deckFingerprint(cards), deckFingerprint([...cards].reverse()));
});
test('text request changes only blueprint presentation and draw count', () => {
  const result = interpretWorkspaceRequest('Simula 10.000 mani, tema chiaro, tre colonne');
  assert.equal(result.samples, 10_000);
  assert.equal(result.columns, 3);
  assert.equal(result.theme, 'parchment');
  const existing = { columns: 2, theme: 'duel', scale: 'normal', panels: defaultPanels() };
  assert.equal(interpretWorkspaceRequest('nascondi le combinazioni', existing).panels.find((p) => p.kind === 'combinations')?.visible, false);
});
test('unknown component types are not valid workspace configurations', () => {
  assert.equal(validWorkspace({ schemaVersion: 1, id: 'a', deckId: 'b', name: 'x', panels: [{ kind: 'unsafe-html', id: 'x', visible: true }], cards: [], simulation: {}, columns: 2, theme: 'duel', scale: 'normal' }), false);
});

test('command routes a filtered card search and rejects invalid filter values', () => {
  assert.deepEqual(interpretIntentAction('Cerca carte tipo:magia archetipo:"Sky Striker" livello:4-6'), {
    kind: 'search', query: '', filters: { type: 'Spell Card', archetype: 'Sky Striker', levelMin: 4, levelMax: 6 },
  });
  assert.throws(() => interpretIntentAction('Cerca carte livello:alta'), /intervallo/);
  assert.throws(() => interpretIntentAction('Cerca carte filtro:segreto'), /sconosciuto/);
});
test('decklist actions never modify a deck and route to existing tools', () => {
  assert.deepEqual(interpretIntentAction('Crea un mazzo'), { kind: 'decks', action: 'create' });
  assert.deepEqual(interpretIntentAction('Importa decklist'), { kind: 'deck', action: 'import' });
  assert.deepEqual(interpretIntentAction('Esporta decklist'), { kind: 'deck', action: 'export' });
  assert.deepEqual(interpretIntentAction('Analizza il mazzo'), { kind: 'deck-analysis' });
  assert.deepEqual(interpretIntentAction('Verifica legalità del mazzo'), { kind: 'decks', action: 'check' });
  assert.deepEqual(interpretIntentAction('Apri schede combo del mazzo'), { kind: 'combo', view: 'sheets' });
  assert.deepEqual(interpretIntentAction('Simula 50 mani da 6 carte e mostra le combinazioni'), { kind: 'workspace' });
  const plan = interpretWorkspaceRequest('Simula 50 mani da 6 carte');
  assert.equal(plan.handSize, 6);
  assert.equal(plan.samples, 50);
  assert.equal(interpretWorkspaceRequest('Simula 50 mani seed:42').seed, 42);
  assert.deepEqual(readIntentStarters('starter:"starter"', cards, []), [1]);
  assert.throws(() => readIntentStarters('starter:"Carta assente"', cards, []), /assente/);
  assert.throws(() => interpretIntentAction('Fai una cosa sconosciuta'), /non riconosciuta/);
  assert.deepEqual(interpretIntentAction('Esporta YDKE'), { kind: 'deck', action: 'export-ydke' });
});
