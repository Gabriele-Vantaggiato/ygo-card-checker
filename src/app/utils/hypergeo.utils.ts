/** Hypergeometric helpers for opening-hand odds (population N, success K, draws n). */

export function combinations(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i++) {
    result = (result * (n - kk + i)) / i;
  }
  return result;
}

/** P(X = k) with hypergeometric: K successes in N, draw n. */
export function hypergeometricPmf(N: number, K: number, n: number, k: number): number {
  if (N <= 0 || n <= 0) {
    return 0;
  }
  const denom = combinations(N, n);
  if (denom === 0) {
    return 0;
  }
  return combinations(K, k) * combinations(N - K, n - k) / denom;
}

/** P(X >= 1) = 1 - P(X = 0). */
export function hypergeometricAtLeastOne(N: number, K: number, n: number): number {
  if (K <= 0) {
    return 0;
  }
  if (K >= N) {
    return 1;
  }
  return 1 - hypergeometricPmf(N, K, n, 0);
}

export function clamp01(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function toPercent(probability: number, digits = 1): string {
  return `${(clamp01(probability) * 100).toFixed(digits)}%`;
}

/**
 * Approx P(at least 1 starter AND at least 1 extender/trap) in n draws.
 * Uses inclusion via enumerating joint counts (exact for small n).
 */
export function hypergeometricBothClasses(
  N: number,
  starters: number,
  extenders: number,
  n: number,
): number {
  const S = Math.max(0, starters);
  const E = Math.max(0, extenders);
  const other = Math.max(0, N - S - E);
  if (N <= 0 || n <= 0 || S === 0 || E === 0) {
    return 0;
  }

  const denom = combinations(N, n);
  if (denom === 0) {
    return 0;
  }

  let favorable = 0;
  for (let s = 1; s <= Math.min(S, n); s++) {
    for (let e = 1; e <= Math.min(E, n - s); e++) {
      const o = n - s - e;
      if (o < 0 || o > other) {
        continue;
      }
      favorable += combinations(S, s) * combinations(E, e) * combinations(other, o);
    }
  }
  return clamp01(favorable / denom);
}
