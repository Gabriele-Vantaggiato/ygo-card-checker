import { detectEngines } from './combo-engine-detection.utils';
import { ComboEngine } from '../models/combo-engine.model';

const artifact: ComboEngine = {
  key: 'artifact',
  name: 'Artifact',
  description: null,
  minCardsThreshold: 2,
  cards: [
    { cardId: 1, name: 'Artifact Sanctum', role: 'core', minCopies: 1 },
    { cardId: 2, name: 'Artifact Ignition', role: 'core', minCopies: 1 },
    { cardId: 3, name: 'Artifact Moralltach', role: 'support', minCopies: 1 },
  ],
};

const hands: ComboEngine = {
  key: 'hands',
  name: 'Hands',
  description: null,
  minCardsThreshold: 2,
  cards: [
    { cardId: 10, name: 'Hand Card A', role: 'core', minCopies: 1 },
    { cardId: 11, name: 'Hand Card B', role: 'core', minCopies: 1 },
  ],
};

describe('detectEngines', () => {
  it('detects an engine whose card count meets the threshold', () => {
    const deck = new Map([[1, 1], [2, 1]]);
    const detected = detectEngines(deck, [artifact]);
    expect(detected.length).toBe(1);
    expect(detected[0].engine.key).toBe('artifact');
    expect(detected[0].matchedCardIds.sort()).toEqual([1, 2]);
  });

  it('does not detect an engine below its threshold', () => {
    const deck = new Map([[1, 1]]);
    expect(detectEngines(deck, [artifact])).toEqual([]);
  });

  it('respects minCopies per engine card', () => {
    const deckWithOneCopy = new Map([[1, 1], [2, 1]]);
    const engineRequiringTwoCopies: ComboEngine = {
      ...artifact,
      cards: artifact.cards.map((card) => ({ ...card, minCopies: 2 })),
    };
    expect(detectEngines(deckWithOneCopy, [engineRequiringTwoCopies])).toEqual([]);
  });

  it('detects multiple hybrid engines in the same deck simultaneously', () => {
    const deck = new Map([[1, 1], [2, 1], [10, 1], [11, 1]]);
    const detected = detectEngines(deck, [artifact, hands]);
    expect(detected.map((d) => d.engine.key).sort()).toEqual(['artifact', 'hands']);
  });
});
