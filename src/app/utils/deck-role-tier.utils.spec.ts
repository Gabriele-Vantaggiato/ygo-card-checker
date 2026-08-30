import { resolveRoleTier, scaledMaxCopies } from './deck-role-tier.utils';

describe('deck-role-tier.utils', () => {
  describe('resolveRoleTier', () => {
    it('prefers script role over relation', () => {
      expect(resolveRoleTier('mentions_card', ['starter'])).toBe('core');
      expect(resolveRoleTier('engine', ['trap'])).toBe('tech');
    });

    it('falls back to relation when no script role matches', () => {
      expect(resolveRoleTier('gy_synergy', [])).toBe('core');
      expect(resolveRoleTier('archetype', [])).toBe('support');
      expect(resolveRoleTier('mentions_card', [])).toBe('tech');
    });

    it('defaults to support for unknown relation and no script role', () => {
      expect(resolveRoleTier('unknown_relation', [])).toBe('support');
    });
  });

  describe('scaledMaxCopies', () => {
    it('keeps formatMax below the tier taper threshold', () => {
      expect(scaledMaxCopies(3, 'core', 0.5)).toBe(3);
      expect(scaledMaxCopies(3, 'tech', 0.3)).toBe(3);
    });

    it('tapers toward 1 as fullness approaches 1 above threshold', () => {
      expect(scaledMaxCopies(3, 'tech', 0.45)).toBe(3);
      expect(scaledMaxCopies(3, 'tech', 1)).toBe(1);
      const mid = scaledMaxCopies(3, 'tech', 0.725);
      expect(mid).toBeGreaterThanOrEqual(1);
      expect(mid).toBeLessThan(3);
    });

    it('never scales below 1 copy', () => {
      expect(scaledMaxCopies(3, 'core', 1)).toBe(1);
    });

    it('passes through formatMax of 1 unchanged (limited cards)', () => {
      expect(scaledMaxCopies(1, 'tech', 1)).toBe(1);
      expect(scaledMaxCopies(1, 'core', 0)).toBe(1);
    });

    it('core tier tapers later than tech tier at the same fullness', () => {
      const fullness = 0.75;
      expect(scaledMaxCopies(3, 'core', fullness)).toBeGreaterThan(
        scaledMaxCopies(3, 'tech', fullness),
      );
    });
  });
});
