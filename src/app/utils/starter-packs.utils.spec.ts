import type { RouletteDeck } from '../services/deck-roulette.service';
import { CardMeta, KIND } from './card-meta.utils';
import { seededRandom } from './competitive-score.utils';
import { buildArchetypeSeeds, drawStarterPacks } from './starter-packs.utils';

const deck = (id: string, archetype: string, main: number[], over: Partial<RouletteDeck> = {}): RouletteDeck => ({
  id, name: id, archetype, source: 'tournament', coverCardId: null, main, extra: [], side: [], ...over,
});
const meta = new Map<number, CardMeta>(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 50].map((id) => [id, { roles: 0, kind: id >= 5 && id <= 6 ? KIND.spell : KIND.monster, level: 4, tuner: false, flags: 0, archetype: 0 }]),
);

/** Two archetypes with distinctive cards (1-4 and 5-8) plus a staple (50) everybody plays, and a tiny one. */
const pool: RouletteDeck[] = [
  ...Array.from({ length: 8 }, (_, i) => deck(`a${i}`, 'Alpha', [1, 1, 1, 2, 2, 3, 3, 4, 50, 50, 50], { placement: i + 1, url: `https://x/${i}` })),
  ...Array.from({ length: 6 }, (_, i) => deck(`b${i}`, 'Beta', [5, 5, 6, 6, 7, 7, 8, 8, 50, 50])),
  ...Array.from({ length: 2 }, (_, i) => deck(`c${i}`, 'Tiny', [9, 9, 9, 1, 2, 3])),
];

describe('starter packs', () => {
  describe('buildArchetypeSeeds', () => {
    const seeds = buildArchetypeSeeds(pool);

    it('keeps only archetypes with enough tournament decks and lists them by size', () => {
      expect(seeds.map((s) => s.archetype)).toEqual(['Alpha', 'Beta']);
      expect(seeds[0].deckCount).toBe(8);
      expect(seeds[0].metaShare).toBeCloseTo(8 / 16);
    });

    it('ranks archetype-specific cards before staples played by everyone', () => {
      const ids = seeds[0].cards.map((c) => c.cardId);
      expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(50));
      expect(seeds[0].cards.find((c) => c.cardId === 1)!.lift).toBeGreaterThan(seeds[0].cards.find((c) => c.cardId === 50)!.lift);
    });

    it('remembers the best-placed deck as the example', () => {
      expect(seeds[0].bestDeck).toEqual({ name: 'a0', url: 'https://x/0', placement: 1 });
    });

    it('ignores community decks and returns nothing for an empty pool', () => {
      expect(buildArchetypeSeeds(pool.map((d) => ({ ...d, source: 'community' as const })))).toEqual([]);
      expect(buildArchetypeSeeds([])).toEqual([]);
    });
  });

  describe('drawStarterPacks', () => {
    const seeds = buildArchetypeSeeds(pool);

    it('opens packs of three distinct cards from different archetypes', () => {
      const packs = drawStarterPacks(seeds, meta, 2, seededRandom(1));
      expect(packs.length).toBe(2);
      expect(new Set(packs.map((p) => p.archetype)).size).toBe(2);
      for (const pack of packs) {
        expect(pack.cardIds.length).toBe(3);
        expect(new Set(pack.cardIds).size).toBe(3);
      }
    });

    it('only uses cards of the archetype it names', () => {
      const alpha = new Set([1, 2, 3, 4, 50]);
      const beta = new Set([5, 6, 7, 8, 50]);
      for (let seed = 1; seed <= 20; seed++) {
        for (const pack of drawStarterPacks(seeds, meta, 2, seededRandom(seed))) {
          const allowed = pack.archetype === 'Alpha' ? alpha : beta;
          expect(pack.cardIds.every((id) => allowed.has(id))).toBeTrue();
        }
      }
    });

    it('always includes a monster', () => {
      for (let seed = 1; seed <= 30; seed++) {
        for (const pack of drawStarterPacks(seeds, meta, 2, seededRandom(seed))) {
          expect(pack.cardIds.some((id) => meta.get(id)?.kind === KIND.monster)).toBeTrue();
        }
      }
    });

    it('is reproducible with the same random source and varies with another', () => {
      const a = drawStarterPacks(seeds, meta, 2, seededRandom(7));
      expect(drawStarterPacks(seeds, meta, 2, seededRandom(7))).toEqual(a);
      const variants = new Set(Array.from({ length: 30 }, (_, s) => JSON.stringify(drawStarterPacks(seeds, meta, 1, seededRandom(s + 100)))));
      expect(variants.size).toBeGreaterThan(1);
    });

    it('skips archetypes already seen when others exist, and falls back when it cannot', () => {
      expect(drawStarterPacks(seeds, meta, 1, seededRandom(3), new Set(['Alpha']))[0].archetype).toBe('Beta');
      expect(drawStarterPacks(seeds, meta, 1, seededRandom(3), new Set(['Alpha', 'Beta'])).length).toBe(1);
    });
  });
});
