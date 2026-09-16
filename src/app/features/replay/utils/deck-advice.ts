import { DeckAdviceItem, ReplayAnalysis, ReplayDeckAdvice } from '../../../models/replay.model';
import { unusedFocusDeckCodes } from './missplay-analyzer';

/**
 * Aggregate unused-card / missed-effect signals across multiple replay analyses.
 */
export function buildDeckAdvice(analyses: ReplayAnalysis[]): ReplayDeckAdvice | null {
  if (analyses.length === 0) return null;

  const unusedHits = new Map<number, number>();

  for (const a of analyses) {
    for (const code of unusedFocusDeckCodes(a.replay)) {
      unusedHits.set(code, (unusedHits.get(code) ?? 0) + 1);
    }
  }

  const minUnusedHits = analyses.length >= 2 ? 2 : 1;
  const items: DeckAdviceItem[] = [];

  for (const [code, hits] of unusedHits) {
    if (hits < minUnusedHits) continue;
    items.push({
      code,
      replayHits: hits,
      reasonKey: 'replay.deckAdvice.unusedAcross',
    });
  }

  items.sort((a, b) => b.replayHits - a.replayHits || a.code - b.code);

  return {
    items: items.slice(0, 24),
    replaysUsed: analyses.length,
    focusName: analyses[0].replay.focusName,
  };
}
