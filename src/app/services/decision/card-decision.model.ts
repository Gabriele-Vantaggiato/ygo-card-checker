/** Only callers' already legal candidates may be reordered. Scores are not probabilities. */
export interface DecisionCandidate { cardId: number; text: string }
export interface DecisionScore { cardId: number; score: number }
export const MAX_DECISION_CANDIDATES = 24;
export const DECISION_MODEL = 'Xenova/multilingual-e5-small';
export const DECISION_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';

export type DecisionRequest =
  | { kind: 'rank'; id: number; query: string; candidates: DecisionCandidate[] }
  | { kind: 'cancel'; id: number };
export type DecisionResponse =
  | { kind: 'loading'; id: number }
  | { kind: 'result'; id: number; scores: DecisionScore[] }
  | { kind: 'error'; id: number };

/** Fail closed on malformed responses; keep the entire baseline when the top is ambiguous.
 * The 0.01 margin is an experimental abstention policy, not calibrated confidence.
 * Co-occurrence/knowledge ranking retains 65% of the final ordering signal. */
export function blendDecisionRanking(
  candidates: readonly DecisionCandidate[], raw: unknown,
): DecisionScore[] {
  if (!Array.isArray(raw) || raw.length !== candidates.length || candidates.length < 2) return [];
  const allowed = new Set(candidates.map(c => c.cardId));
  if (allowed.size !== candidates.length) return [];
  const scores = new Map<number, number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || !allowed.has(item.cardId) ||
        scores.has(item.cardId) || typeof item.score !== 'number' ||
        !Number.isFinite(item.score) || item.score < -1.001 || item.score > 1.001) return [];
    scores.set(item.cardId, item.score);
  }
  const descending = [...scores.values()].sort((a, b) => b - a);
  const high = descending[0];
  const low = descending[descending.length - 1];
  if (high - low < 0.02 || high - descending[1] < 0.01) return [];
  return candidates.map((c, i) => ({
    cardId: c.cardId,
    score: 0.65 * (1 - i / (candidates.length - 1)) +
      0.35 * ((scores.get(c.cardId)! - low) / (high - low)),
  })).sort((a, b) => b.score - a.score);
}
