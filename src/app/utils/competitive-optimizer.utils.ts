import { CompetitiveContext, scoreDeck } from './competitive-score.utils';

/** One candidate copy of a card for the main deck, with the consensus probability of real decks playing it. */
export interface MainSlot {
  cardId: number;
  /** 1-based copy number counted from zero copies (copy 2 only makes sense when copy 1 is in the deck). */
  copy: number;
  probability: number;
}

export interface OptimizeOptions {
  /** Weight of the competitive score against consensus probability. 0 returns the plain consensus fill. */
  lambda?: number;
  maxSwaps?: number;
  /** How many of the most probable unselected candidates are tried for each swap. */
  candidatePool?: number;
  /** Candidates below this consensus probability are never brought in. */
  minProbability?: number;
  /** Monte Carlo samples per evaluation (lower = faster, noisier). */
  samples?: number;
}

const DEFAULTS = { lambda: 2, maxSwaps: 30, candidatePool: 24, minProbability: 0.12, samples: 300 } as const;

interface Candidate {
  cardId: number;
  /** Probability of the k-th planned copy, index 0 = first copy added on top of what the user has. */
  probabilities: number[];
  have: number;
}

/**
 * Chooses which `gap` copies to add to the main deck. Starts from the consensus fill (most probable copies),
 * then hill-climbs: swapping one added copy for another candidate when it raises
 *   consensusProbability(mean) + lambda * competitiveScore(deck)
 * Copies the user already has are never removed, and a card's copies stay consecutive, so copy limits and
 * banlist caps that the slots respect are preserved.
 *
 * @param userMain main deck as card ids, one entry per copy
 * @param slots candidate copies; copy numbers below the user's current count must already be excluded
 */
export function optimizeMainFill(
  userMain: readonly number[],
  slots: readonly MainSlot[],
  gap: number,
  ctx: CompetitiveContext,
  options: OptimizeOptions = {},
): MainSlot[] {
  const opts = { ...DEFAULTS, ...options };
  const ordered = [...slots].sort((a, b) => b.probability - a.probability || a.copy - b.copy);
  const baseline = ordered.slice(0, Math.max(gap, 0));
  if (opts.lambda <= 0 || gap <= 0 || ordered.length === 0) return baseline;

  const candidates = new Map<number, Candidate>();
  const have = new Map<number, number>();
  for (const id of userMain) have.set(id, (have.get(id) ?? 0) + 1);
  for (const slot of [...slots].sort((a, b) => a.copy - b.copy)) {
    const entry = candidates.get(slot.cardId) ?? { cardId: slot.cardId, probabilities: [], have: have.get(slot.cardId) ?? 0 };
    entry.probabilities.push(slot.probability);
    candidates.set(slot.cardId, entry);
  }

  // planned copies per card, starting from the baseline
  const planned = new Map<number, number>();
  for (const slot of baseline) planned.set(slot.cardId, (planned.get(slot.cardId) ?? 0) + 1);

  const deckOf = (counts: ReadonlyMap<number, number>): number[] => {
    const deck = [...userMain];
    for (const [id, n] of counts) for (let i = 0; i < n; i++) deck.push(id);
    return deck;
  };
  const objective = (counts: ReadonlyMap<number, number>): number => {
    let probability = 0;
    let picked = 0;
    for (const [id, n] of counts) {
      const probs = candidates.get(id)?.probabilities ?? [];
      for (let k = 0; k < n; k++) {
        probability += probs[k] ?? 0;
        picked++;
      }
    }
    const mean = picked > 0 ? probability / picked : 0;
    return mean + opts.lambda * scoreDeck(deckOf(counts), ctx, { samples: opts.samples }).overall;
  };

  let best = objective(planned);
  for (let swap = 0; swap < opts.maxSwaps; swap++) {
    // candidates to bring in: next unused copy of each card, most probable first
    const additions = [...candidates.values()]
      .map((c) => ({ c, k: planned.get(c.cardId) ?? 0 }))
      .filter(({ c, k }) => k < c.probabilities.length && c.probabilities[k] >= opts.minProbability)
      .sort((a, b) => b.c.probabilities[b.k] - a.c.probabilities[a.k])
      .slice(0, opts.candidatePool);
    const removals = [...planned.entries()].filter(([, n]) => n > 0).map(([id]) => id);

    let bestMove: { remove: number; add: number } | null = null;
    let bestValue = best + 1e-9;
    for (const remove of removals) {
      planned.set(remove, planned.get(remove)! - 1);
      for (const { c } of additions) {
        if (c.cardId === remove) continue;
        planned.set(c.cardId, (planned.get(c.cardId) ?? 0) + 1);
        const value = objective(planned);
        planned.set(c.cardId, planned.get(c.cardId)! - 1);
        if (value > bestValue) {
          bestValue = value;
          bestMove = { remove, add: c.cardId };
        }
      }
      planned.set(remove, planned.get(remove)! + 1);
    }
    if (!bestMove) break;
    planned.set(bestMove.remove, planned.get(bestMove.remove)! - 1);
    planned.set(bestMove.add, (planned.get(bestMove.add) ?? 0) + 1);
    best = bestValue;
  }

  const result: MainSlot[] = [];
  for (const [id, n] of planned) {
    const probs = candidates.get(id)?.probabilities ?? [];
    for (let k = 0; k < n; k++) result.push({ cardId: id, copy: (candidates.get(id)?.have ?? 0) + k + 1, probability: probs[k] ?? 0 });
  }
  return result;
}
