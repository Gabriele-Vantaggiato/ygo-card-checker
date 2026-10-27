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
 * Aggregates the top-K lists of the last N sharp frames. `score` of a candidate is the sum of its
 * per-frame scores; candidates are ranked by mean score (sum / framesUsed).
 */
export class FrameVoter {
  private readonly windowSize: number;
  private readonly minFrames: number;
  private readonly minMargin: number;
  private frames: (readonly FrameHit[])[] = [];

  constructor(options: { windowSize?: number; minFrames?: number; minMargin?: number } = {}) {
    this.windowSize = options.windowSize ?? 5;
    this.minFrames = options.minFrames ?? 3;
    this.minMargin = options.minMargin ?? 0.05;
  }

  push(hits: readonly FrameHit[]): VoteResult {
    this.frames.push(hits);
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
    const confident = !!top && framesUsed >= this.minFrames && top.votes >= this.minFrames && margin >= this.minMargin;
    return { candidates, confident, framesUsed };
  }

  reset(): void {
    this.frames = [];
  }
}
