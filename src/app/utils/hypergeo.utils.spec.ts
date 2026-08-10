import {
  clamp01,
  combinations,
  hypergeometricAtLeastOne,
  hypergeometricBothClasses,
  hypergeometricPmf,
  toPercent,
} from './hypergeo.utils';

describe('hypergeo.utils', () => {
  describe('combinations', () => {
    it('computes nCk for typical values', () => {
      expect(combinations(5, 2)).toBe(10);
      expect(combinations(40, 5)).toBeCloseTo(658008, 0);
    });

    it('returns 1 for k = 0 or k = n', () => {
      expect(combinations(6, 0)).toBe(1);
      expect(combinations(6, 6)).toBe(1);
    });

    it('returns 0 for out-of-range k', () => {
      expect(combinations(5, -1)).toBe(0);
      expect(combinations(5, 6)).toBe(0);
      expect(combinations(-1, 0)).toBe(0);
    });
  });

  describe('hypergeometricPmf', () => {
    it('matches a known hand-trap draw probability', () => {
      // 40-card deck, 3 copies of a card, drawing 5: P(exactly 1) ≈ 0.3011
      expect(hypergeometricPmf(40, 3, 5, 1)).toBeCloseTo(0.3011, 3);
    });

    it('returns 0 for degenerate inputs', () => {
      expect(hypergeometricPmf(0, 3, 5, 1)).toBe(0);
      expect(hypergeometricPmf(40, 3, 0, 1)).toBe(0);
    });
  });

  describe('hypergeometricAtLeastOne', () => {
    it('returns 0 when there are no successes', () => {
      expect(hypergeometricAtLeastOne(40, 0, 5)).toBe(0);
    });

    it('returns 1 when every copy would be drawn', () => {
      expect(hypergeometricAtLeastOne(40, 45, 5)).toBe(1);
    });

    it('matches the classic 3-of-40 in opening 5 probability', () => {
      expect(hypergeometricAtLeastOne(40, 3, 5)).toBeCloseTo(0.3376, 3);
    });
  });

  describe('hypergeometricBothClasses', () => {
    it('is 0 when either class is empty', () => {
      expect(hypergeometricBothClasses(40, 0, 10, 5)).toBe(0);
      expect(hypergeometricBothClasses(40, 10, 0, 5)).toBe(0);
    });

    it('is within [0,1] and lower than drawing either class alone', () => {
      const both = hypergeometricBothClasses(40, 10, 10, 5);
      expect(both).toBeGreaterThan(0);
      expect(both).toBeLessThanOrEqual(1);
      expect(both).toBeLessThan(hypergeometricAtLeastOne(40, 10, 5));
    });
  });

  describe('clamp01 / toPercent', () => {
    it('clamps out-of-range and non-finite values', () => {
      expect(clamp01(-0.5)).toBe(0);
      expect(clamp01(1.5)).toBe(1);
      expect(clamp01(Number.NaN)).toBe(0);
      expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('formats a probability as a percentage string', () => {
      expect(toPercent(0.5)).toBe('50.0%');
      expect(toPercent(0.3396, 2)).toBe('33.96%');
    });
  });
});
