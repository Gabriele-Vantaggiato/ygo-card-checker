export interface FrameHit {
  id: number;
  score: number;
}

export interface VotedCandidate {
  id: number;
  score: number;
  votes: number;
}

export interface VoteResult {
  candidates: VotedCandidate[];
  confident: boolean;
  framesUsed: number;
}

/**
 * Default absolute floor for the top candidate's mean fused score (full cos + art cos, 0..2) over the
 * frames it appeared in. Measured (2026-10-27, Node q8 recipe, 704-row / 700-card index, per-frame
 * top-1 fused score; 150 cards x 3 degrade() levels vs 150 synthetic non-card frames):
 *   true card  mild   p10 1.845 min 1.751 | medium p10 1.644 min 1.509 | harsh p10 1.311 min 1.224
 *   non-card   grey / noise / colour gradient / tiny card tile on grey / blurred crop of another
 *              card's art: p95 1.237, max 1.331 (the blurred art crops are the hardest)
 * 1.40 rejects no mild/medium frame and no non-card frame (27% of the harsh-glare frames fall below).
 * With the full ~13k-card index the true-card score is unchanged (same nearest row) but non-card
 * frames find closer random neighbours, so their scores rise somewhat: the 0.07 headroom above the
 * non-card max is the part that can shrink. Re-check on real webcam frames.
 */
export const DEFAULT_MIN_SCORE = 1.4;

/**
 * Aggregates the top-K lists of the last N sharp frames. `score` of a candidate is the sum of its
 * per-frame scores; candidates are ranked by mean score (sum / framesUsed). A vote is confident only
 * when the top candidate is stable (minFrames votes), clearly ahead (minMargin) and similar enough
 * in absolute terms (minScore), so an empty table or a hand never produces a card.
 */
export class FrameVoter {
  private readonly windowSize: number;
  private readonly minFrames: number;
  private readonly minMargin: number;
  private readonly minScore: number;
  private frames: (readonly FrameHit[])[] = [];

  constructor(options: { windowSize?: number; minFrames?: number; minMargin?: number; minScore?: number } = {}) {
    this.windowSize = options.windowSize ?? 5;
    this.minFrames = options.minFrames ?? 3;
    this.minMargin = options.minMargin ?? 0.05;
    this.minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  }

  push(hits: readonly FrameHit[]): VoteResult {
    // copied: the caller may reuse or mutate its array after the push
    this.frames.push(hits.map((h) => ({ id: h.id, score: h.score })));
    if (this.frames.length > this.windowSize) this.frames.splice(0, this.frames.length - this.windowSize);

    const acc = new Map<number, VotedCandidate>();
    for (const frame of this.frames) {
      const seen = new Set<number>();
      for (const h of frame) {
        if (seen.has(h.id)) continue;
        seen.add(h.id);
        const c = acc.get(h.id) ?? { id: h.id, score: 0, votes: 0 };
        c.score += h.score;
        c.votes++;
        acc.set(h.id, c);
      }
    }
    const framesUsed = this.frames.length;
    const candidates = [...acc.values()].sort((a, b) => b.score - a.score);
    const top = candidates[0];
    const second = candidates[1];
    const margin = top ? (top.score - (second?.score ?? 0)) / framesUsed : 0;
    const confident =
      !!top &&
      framesUsed >= this.minFrames &&
      top.votes >= this.minFrames &&
      margin >= this.minMargin &&
      top.score / top.votes >= this.minScore;
    return { candidates, confident, framesUsed };
  }

  reset(): void {
    this.frames = [];
  }
}
