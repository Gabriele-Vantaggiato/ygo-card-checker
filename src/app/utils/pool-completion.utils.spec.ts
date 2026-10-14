import type { RouletteDeck } from '../services/deck-roulette.service';
import { CardMeta, KIND } from './card-meta.utils';
import { completeFromPool, planPoolAdds, rankPoolDecks } from './pool-completion.utils';

const deck = (id: string, main: number[], extra: number[] = [], side: number[] = []): RouletteDeck => ({
  id,
  name: id,
  source: 'tournament',
  coverCardId: null,
  main,
  extra,
  side,
});

const qty = (...pairs: Array<[number, number]>) => new Map<number, number>(pairs);

describe('pool completion', () => {
  const mermail = deck('mermail', [1, 1, 1, 2, 2, 3, 3, 4, 5, 6], [100, 101]);
  const warrior = deck('warrior', [10, 10, 11, 12, 13], [200]);

  describe('rankPoolDecks', () => {
    it('ranks the deck sharing most cards first and drops unrelated ones', () => {
      const matches = rankPoolDecks(qty([1, 3], [2, 2], [3, 1]), [warrior, mermail]);
      expect(matches.map((m) => m.deck.id)).toEqual(['mermail']);
      expect(matches[0].overlap).toBe(6);
      expect(matches[0].coverage).toBe(1);
    });

    it('counts shared copies, not just shared names', () => {
      const [match] = rankPoolDecks(qty([1, 3], [2, 2], [4, 1]), [mermail]);
      expect(match.overlap).toBe(6);
      const [fewer] = rankPoolDecks(qty([1, 3], [2, 2], [4, 1]), [deck('x', [1, 2, 4, 9, 9, 9])], { minCoverage: 0 });
      expect(fewer.overlap).toBe(3);
    });

    it('returns nothing for an empty deck or a too-small overlap', () => {
      expect(rankPoolDecks(new Map(), [mermail])).toEqual([]);
      expect(rankPoolDecks(qty([1, 1], [99, 1]), [mermail])).toEqual([]);
    });
  });

  describe('planPoolAdds', () => {
    const matches = rankPoolDecks(qty([1, 3], [2, 2]), [mermail]);

    it('proposes missing cards and never exceeds the pool deck copies', () => {
      const adds = planPoolAdds(new Map([['main:1', 3], ['main:2', 1]]), matches, { main: 10, extra: 5, side: 0 });
      const byCard = new Map(adds.map((a) => [`${a.section}:${a.cardId}`, a.quantity]));
      expect(byCard.get('main:2')).toBe(1); // had 1, pool deck plays 2
      expect(byCard.has('main:1')).toBeFalse(); // already at 3
      expect(byCard.get('extra:100')).toBe(1);
    });

    it('respects the gap per section', () => {
      const adds = planPoolAdds(new Map(), matches, { main: 2, extra: 0, side: 0 });
      expect(adds.reduce((sum, a) => sum + a.quantity, 0)).toBe(2);
      expect(adds.every((a) => a.section === 'main')).toBeTrue();
    });

    it('skips side cards when the side gap is zero', () => {
      const withSide = deck('s', [1, 1, 1, 2, 2, 3], [], [900, 901]);
      const m = rankPoolDecks(qty([1, 3], [2, 2]), [withSide]);
      const adds = planPoolAdds(new Map(), m, { main: 5, extra: 0, side: 0 });
      expect(adds.some((a) => a.section === 'side')).toBeFalse();
    });

    it('prefers cards played by more of the matched decks', () => {
      const a = deck('a', [1, 1, 1, 2, 2, 7]);
      const b = deck('b', [1, 1, 1, 2, 2, 8, 7]);
      const m = rankPoolDecks(qty([1, 3], [2, 2]), [a, b]);
      const adds = planPoolAdds(new Map([['main:1', 3], ['main:2', 2]]), m, { main: 1, extra: 0, side: 0 });
      expect(adds[0].cardId).toBe(7);
      expect(adds[0].supportCount).toBe(2);
    });
  });

  describe('consensus and reachability', () => {
    it('weights copies by how many close decks play them', () => {
      const a = deck('a', [1, 1, 1, 2, 2, 7, 7, 7]);
      const b = deck('b', [1, 1, 1, 2, 2, 7, 7]);
      const c = deck('c', [1, 1, 1, 2, 2, 8]);
      const m = rankPoolDecks(qty([1, 3], [2, 2]), [a, b, c], { limit: 3 });
      const adds = planPoolAdds(new Map([['main:1', 3], ['main:2', 2]]), m, { main: 2, extra: 0, side: 0 }, { gamma: 1 });
      expect(adds.find((x) => x.cardId === 7)?.quantity).toBe(2);
      expect(adds.some((x) => x.cardId === 8)).toBeFalse();
    });

    it('prefers Extra Deck cards the planned main can summon', () => {
      const meta = new Map<number, CardMeta>([
        [1, { roles: 0, kind: KIND.monster, level: 4, tuner: false, flags: 0, archetype: 0 }],
        [2, { roles: 0, kind: KIND.monster, level: 4, tuner: false, flags: 0, archetype: 0 }],
        [100, { roles: 0, kind: KIND.xyz, level: 4, tuner: false, flags: 0, archetype: 0 }], // reachable: two level 4
        [101, { roles: 0, kind: KIND.xyz, level: 8, tuner: false, flags: 0, archetype: 0 }], // unreachable
      ]);
      const d1 = deck('d1', [1, 1, 1, 2, 2], [101, 100]);
      const d2 = deck('d2', [1, 1, 1, 2, 2], [101]);
      const m = rankPoolDecks(qty([1, 3], [2, 2]), [d1, d2]);
      // 101 is played by both decks, 100 by one: without meta 101 wins, with meta the reachable 100 does
      const user = new Map([['main:1', 3], ['main:2', 2]]);
      expect(planPoolAdds(user, m, { main: 0, extra: 1, side: 0 })[0].cardId).toBe(101);
      expect(planPoolAdds(user, m, { main: 0, extra: 1, side: 0 }, { meta })[0].cardId).toBe(100);
    });

    it('completeFromPool returns null when nothing is similar', () => {
      expect(completeFromPool(new Map([['main:999', 3]]), [deck('x', [1, 2, 3])], { main: 5, extra: 0, side: 0 })).toBeNull();
    });
  });
});
