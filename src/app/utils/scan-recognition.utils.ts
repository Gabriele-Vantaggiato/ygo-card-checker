/** Sharp-but-unconfident time after which the UI may offer the candidate strip. */
export const OFFER_CANDIDATES_AFTER_MS = 2500;

/** True once the recognizer has looked at sharp frames for long enough without a confident vote. */
export function shouldOfferCandidates(sharpMsWithoutConfidence: number, thresholdMs: number = OFFER_CANDIDATES_AFTER_MS): boolean {
  return sharpMsWithoutConfidence >= thresholdMs;
}

/**
 * Accumulates the time spent on sharp frames without a confident vote. Blurry frames pause the
 * clock (they neither add time nor reset it); a confident vote resets it. A single step is capped
 * so a stalled tick (tab in background, slow embed) does not jump past the threshold at once.
 */
export class UnconfidentClock {
  private elapsed = 0;
  private lastAt: number | null = null;

  constructor(private readonly maxStepMs = 1000) {}

  push(state: 'sharp-unconfident' | 'blurry' | 'confident', now: number): number {
    if (state === 'confident') {
      this.reset();
      return 0;
    }
    if (state === 'blurry') {
      this.lastAt = null;
      return this.elapsed;
    }
    if (this.lastAt !== null) {
      this.elapsed += Math.min(Math.max(0, now - this.lastAt), this.maxStepMs);
    }
    this.lastAt = now;
    return this.elapsed;
  }

  get ms(): number {
    return this.elapsed;
  }

  reset(): void {
    this.elapsed = 0;
    this.lastAt = null;
  }
}

/**
 * "Same card still in view" guard (ScanConsensus semantics for card ids): after `block(id)`, that id
 * is not eligible again until it has been observed absent (another top card, or blurry/empty frames)
 * for at least `cooldownMs`. Absence needs positive evidence: two slow frames that both show the
 * card never release it, however far apart they are. Only the last emitted id is tracked.
 */
export class PresenceCooldown {
  private blockedId: number | null = null;
  /** Time of the first absent observation since the blocked card was last seen; null while in view. */
  private absentSince: number | null = null;

  constructor(private readonly cooldownMs = 1500) {}

  /** Records the top id of a frame (null = blurry/no match). Returns whether `id` may be emitted. */
  push(id: number | null, now: number): boolean {
    if (id !== this.blockedId || this.blockedId === null) {
      if (this.blockedId !== null && this.absentSince === null) {
        this.absentSince = now;
      }
      return id !== null;
    }
    if (this.absentSince !== null && now - this.absentSince >= this.cooldownMs) {
      this.reset();
      return true;
    }
    this.absentSince = null;
    return false;
  }

  isBlocked(id: number): boolean {
    return id === this.blockedId;
  }

  block(id: number): void {
    this.blockedId = id;
    this.absentSince = null;
  }

  reset(): void {
    this.blockedId = null;
    this.absentSince = null;
  }
}

/** Debug line for the diagnostics box: `id:score` of the best `n` hits, scores with 3 decimals. */
export function formatTopHits(hits: readonly { id: number; score: number }[], n = 5): string {
  return hits
    .slice(0, n)
    .map((h) => `${h.id}:${h.score.toFixed(3)}`)
    .join(' ');
}
