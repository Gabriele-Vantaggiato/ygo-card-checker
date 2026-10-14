import { CardMeta, FLAG, KIND } from './card-meta.utils';
import { CompetitiveContext, FOCUS_WEIGHTS, SynergyLinks, archetypeShare, overallScore, brickRate, consistencyScore, engineCore, scoreDeck, usageScore } from './competitive-score.utils';
import { optimizeMainFill } from './competitive-optimizer.utils';

const card = (flags = 0, archetype = 0, kind: number = KIND.monster): CardMeta => ({ roles: 0, kind, level: 4, tuner: false, flags, archetype });
const links = (...rows: Array<[number, Array<[number, number, number]>]>): SynergyLinks => new Map(rows);
const copies = (...pairs: Array<[number, number]>): number[] => pairs.flatMap(([id, n]) => Array<number>(n).fill(id));

describe('competitive score', () => {
  describe('engineCore', () => {
    it('finds the largest group of linked cards and its share of the deck', () => {
      const l = links([1, [[2, 2, 1]]], [2, [[3, 3, 1]]], [10, [[11, 2, 1]]]);
      const counts = new Map([[1, 3], [2, 3], [3, 2], [10, 1], [11, 1], [99, 2]]);
      const { core, share } = engineCore(counts, l);
      expect([...core].sort((a, b) => a - b)).toEqual([1, 2, 3]);
      expect(share).toBeCloseTo(8 / 12);
    });

    it('ignores weak relations such as shared archetype names', () => {
      const l = links([1, [[2, 6, 1]]]);
      expect(engineCore(new Map([[1, 3], [2, 3]]), l).core.size).toBe(1);
    });
  });

  describe('brickRate', () => {
    const meta = new Map<number, CardMeta>([
      [1, card(FLAG.search)],
      [2, card(FLAG.ssHand)],
      [3, card(0)],
      [9, card(0)],
    ]);
    const engine = links([1, [[2, 2, 1], [3, 2, 1]]]);

    it('is low when most of the deck is the engine and high when engine cards are rare', () => {
      const focused = copies([1, 3], [2, 3], [3, 3], [9, 1]); // 9 engine cards, 1 outside
      const diluted = copies([1, 3], [2, 3], [3, 3], [9, 31]); // 9 engine cards in a pile of 31 others
      const a = brickRate(focused, { meta, links: engine });
      const b = brickRate(diluted, { meta, links: engine });
      expect(a).toBeLessThan(b);
      expect(b).toBeGreaterThan(0.2);
    });

    it('is deterministic and treats tiny decks as bricked', () => {
      const deck = copies([1, 3], [2, 3], [3, 3], [9, 31]);
      expect(brickRate(deck, { meta, links: engine })).toBe(brickRate(deck, { meta, links: engine }));
      expect(brickRate([1, 2], { meta, links: engine })).toBe(1);
    });
  });

  describe('component scores', () => {
    it('rewards copy concentration', () => {
      expect(consistencyScore(copies([1, 3], [2, 3], [3, 3], [4, 1]))).toBeGreaterThan(consistencyScore(Array.from({ length: 10 }, (_, i) => i)));
      expect(consistencyScore([])).toBe(0);
    });

    it('measures the largest archetype share and ignores cards without one', () => {
      const meta = new Map<number, CardMeta>([[1, card(0, 5)], [2, card(0, 5)], [3, card(0, 7)], [4, card(0, 0)]]);
      expect(archetypeShare([1, 1, 2, 3, 4], meta)).toBeCloseTo(3 / 5);
      expect(archetypeShare([4, 4], meta)).toBe(0);
    });

    it('averages per-copy usage', () => {
      expect(usageScore([1, 1, 2], new Map([[1, 0.6], [2, 0.3]]))).toBeCloseTo(0.5);
      expect(usageScore([], new Map())).toBe(0);
    });
  });

  describe('optimizeMainFill', () => {
    // card 1 and 2 form the engine with the user's cards; card 7 is popular but unrelated to it
    const meta = new Map<number, CardMeta>([
      [1, card(FLAG.search, 5)], [2, card(FLAG.ssHand, 5)], [3, card(FLAG.ssHand, 5)],
      [7, card(0, 0)], [8, card(0, 0)],
    ]);
    const ctx: CompetitiveContext = { meta, links: links([1, [[2, 2, 1], [3, 2, 1]]]), usage: new Map([[1, 0.5], [2, 0.5], [3, 0.5], [7, 0.5], [8, 0.1]]) };
    const userMain = copies([1, 3], [2, 3], ...(Array.from({ length: 24 }, (_, i) => [100 + i, 1] as [number, number])));
    const slots = [
      { cardId: 7, copy: 1, probability: 0.9 },
      { cardId: 3, copy: 1, probability: 0.8 },
      { cardId: 3, copy: 2, probability: 0.7 },
      { cardId: 8, copy: 1, probability: 0.3 },
    ];

    it('returns the plain consensus fill when lambda is 0', () => {
      const picked = optimizeMainFill(userMain, slots, 2, ctx, { lambda: 0 });
      expect(picked.map((s) => s.cardId).sort()).toEqual([3, 7]);
    });

    it('never returns more copies than the gap and keeps copies of a card consecutive', () => {
      const picked = optimizeMainFill(userMain, slots, 3, ctx);
      expect(picked.length).toBe(3);
      const byCard = new Map<number, number[]>();
      for (const s of picked) byCard.set(s.cardId, [...(byCard.get(s.cardId) ?? []), s.copy]);
      for (const nums of byCard.values()) expect(nums.sort()).toEqual(nums.map((_, i) => i + 1));
    });

    it('does not make the deck worse than the consensus fill', () => {
      const base = optimizeMainFill(userMain, slots, 3, ctx, { lambda: 0 });
      const tuned = optimizeMainFill(userMain, slots, 3, ctx);
      const deck = (picks: typeof base) => [...userMain, ...picks.map((p) => p.cardId)];
      expect(scoreDeck(deck(tuned), ctx).overall).toBeGreaterThanOrEqual(scoreDeck(deck(base), ctx).overall - 1e-9);
    });

    it('returns nothing to add when the gap is zero', () => {
      expect(optimizeMainFill(userMain, slots, 0, ctx)).toEqual([]);
    });
  });

  describe('focus', () => {
    it('every focus weighs the components to a total of 1', () => {
      for (const w of Object.values(FOCUS_WEIGHTS)) {
        expect(w.brick + w.usage + w.inTurn + w.crossTurn + w.consistency).toBeCloseTo(1);
      }
    });

    it('rewards the focused trait more than the balanced weighting does', () => {
      const lowBrick = overallScore(0.1, { inTurn: 0.2, crossTurn: 0 }, 0.2, 0.2, 'brick') - overallScore(0.6, { inTurn: 0.2, crossTurn: 0 }, 0.2, 0.2, 'brick');
      const lowBrickBalanced = overallScore(0.1, { inTurn: 0.2, crossTurn: 0 }, 0.2, 0.2) - overallScore(0.6, { inTurn: 0.2, crossTurn: 0 }, 0.2, 0.2);
      expect(lowBrick).toBeGreaterThan(lowBrickBalanced);

      const syn = overallScore(0.3, { inTurn: 0.9, crossTurn: 0 }, 0.5, 0.2, 'synergy') - overallScore(0.3, { inTurn: 0.1, crossTurn: 0 }, 0.5, 0.2, 'synergy');
      const synBalanced = overallScore(0.3, { inTurn: 0.9, crossTurn: 0 }, 0.5, 0.2) - overallScore(0.3, { inTurn: 0.1, crossTurn: 0 }, 0.5, 0.2);
      expect(syn).toBeGreaterThan(synBalanced);

      const cons = overallScore(0.3, { inTurn: 0.3, crossTurn: 0 }, 0.9, 0.2, 'consistency') - overallScore(0.3, { inTurn: 0.3, crossTurn: 0 }, 0.1, 0.2, 'consistency');
      const consBalanced = overallScore(0.3, { inTurn: 0.3, crossTurn: 0 }, 0.9, 0.2) - overallScore(0.3, { inTurn: 0.3, crossTurn: 0 }, 0.1, 0.2);
      expect(cons).toBeGreaterThan(consBalanced);
    });

    it('scoreDeck follows the context focus', () => {
      const meta = new Map<number, CardMeta>([[1, card(FLAG.search)], [2, card()]]);
      const base: CompetitiveContext = { meta, links: links([1, [[2, 2, 1]]]), usage: new Map() };
      const deck = copies([1, 3], [2, 37]);
      expect(scoreDeck(deck, { ...base, focus: 'brick' }).overall).not.toBe(scoreDeck(deck, base).overall);
    });
  });
});
