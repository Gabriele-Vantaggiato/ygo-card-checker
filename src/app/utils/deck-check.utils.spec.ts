import { DecklistCard } from '../models/decklist.model';
import { CardCheck, checkDeck } from './deck-check.utils';

const card = (id: number, quantity: number, type = 'Effect Monster', section?: DecklistCard['section']): DecklistCard => ({
  id,
  name: `card${id}`,
  type,
  imageUrlSmall: null,
  quantity,
  section,
});
const legal: CardCheck = { banlistStatus: 'Unlimited', verdict: 'legal' };
const fill = (from: number, count: number): DecklistCard[] => Array.from({ length: count }, (_, i) => card(from + i, 1));

describe('checkDeck', () => {
  it('reports nothing for a legal 40-card deck', () => {
    const deck = fill(1, 40);
    const checks = new Map(deck.map((c) => [c.id, legal]));
    expect(checkDeck(deck, checks)).toEqual([]);
  });

  it('flags forbidden and out-of-pool cards', () => {
    const deck = [...fill(1, 38), card(100, 1), card(101, 1)];
    const checks = new Map<number, CardCheck>(deck.map((c) => [c.id, legal]));
    checks.set(100, { banlistStatus: 'Forbidden', verdict: 'not-legal' });
    checks.set(101, { banlistStatus: 'Unlimited', verdict: 'not-legal' });
    const kinds = checkDeck(deck, checks).map((i) => `${i.kind}:${i.cardId}`);
    expect(kinds).toEqual(['forbidden:100', 'not-legal:101']);
  });

  it('flags copies above the banlist limit across sections', () => {
    const deck = [...fill(1, 39), card(200, 1, 'Effect Monster', 'main'), card(200, 1, 'Effect Monster', 'side')];
    const checks = new Map<number, CardCheck>(deck.map((c) => [c.id, legal]));
    checks.set(200, { banlistStatus: 'Limited', verdict: 'restricted' });
    expect(checkDeck(deck, checks)).toEqual([
      { kind: 'over-limit', cardId: 200, cardName: 'card200', found: 2, allowed: 1 },
    ]);
  });

  it('flags section sizes but ignores an empty deck', () => {
    expect(checkDeck([], new Map())).toEqual([]);
    const small = fill(1, 30);
    expect(checkDeck(small, new Map()).map((i) => i.kind)).toEqual(['main-size']);
    const extras = Array.from({ length: 16 }, (_, i) => card(500 + i, 1, 'Synchro Monster'));
    expect(checkDeck([...fill(1, 40), ...extras], new Map()).map((i) => i.kind)).toEqual(['extra-size']);
  });

  it('skips cards whose legality is unknown', () => {
    expect(checkDeck(fill(1, 40), new Map())).toEqual([]);
  });
});
