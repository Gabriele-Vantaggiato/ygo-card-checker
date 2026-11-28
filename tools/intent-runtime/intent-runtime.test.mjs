/** Run with Node 22+: npm run intent:test (no Angular install needed) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mainDeckSnapshot, simulateOpeningHands, deckFingerprint } from '../../src/app/features/intent-runtime/intent-simulator.ts';
import { defaultPanels, interpretWorkspaceRequest, validWorkspace } from '../../src/app/features/intent-runtime/intent-contract.ts';

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
