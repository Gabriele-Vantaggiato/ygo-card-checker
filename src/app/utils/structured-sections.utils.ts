import { StapleEntry, StapleSection, stapleShareOf } from './format-staples.utils';

/** What the structured fill needs to know about a candidate copy. */
export interface StructuredSlot {
  cardId: number;
  /** 1-based copy number counted from zero copies. */
  copy: number;
  /** Consensus probability that the closest real decks play this copy. */
  probability: number;
}

export interface StructuredContext<T extends StructuredSlot> {
  section: StapleSection;
  /** Consensus candidates for this section (copy numbers the user already has are excluded). */
  slots: readonly T[];
  gap: number;
  /** Matched decks' card lists for this section and their weights, to learn the staple/specific balance. */
  matchedSections: ReadonlyArray<readonly number[]>;
  weights: readonly number[];
  staples: ReadonlyMap<number, StapleEntry>;
  /** Copies of the card the user already has in this section. */
  have: (cardId: number) => number;
  /** Multiplier on a slot's score, e.g. to demote Extra Deck cards the main deck cannot summon. */
  adjust?: (slot: StructuredSlot) => number;
  /** Builds a candidate for a staple no matched deck plays. */
  makeSlot: (cardId: number, copy: number, probability: number) => T;
}

/** How much a staple's score comes from the format-wide copy share vs the closest decks' consensus. */
const STAPLE_FORMAT_WEIGHT = 0.5;
const MAX_COPIES = 3;

export interface StructuredPick<T> {
  slot: T;
  staple: StapleEntry | null;
}

/** Weighted mean share of staples in the matched decks' section: the balance real similar decks strike. */
export function stapleBudgetShare(
  matchedSections: ReadonlyArray<readonly number[]>,
  weights: readonly number[],
  staples: ReadonlyMap<number, StapleEntry>,
): number {
  let total = 0;
  let weighted = 0;
  matchedSections.forEach((cards, i) => {
    if (cards.length === 0) return;
    weighted += weights[i] * stapleShareOf(cards, staples);
    total += weights[i];
  });
  return total > 0 ? weighted / total : 0;
}

/**
 * Structured fill of the Extra or Side Deck: part of the slots go to recurring cards of the format
 * (staples), part to cards specific to the deck's archetype, in the proportion the closest real decks use.
 *  - staples are ranked by a blend of the closest decks' consensus and how widely the format plays them, and
 *    take the format's typical number of copies (usually one in the Extra Deck) instead of copying one deck;
 *  - archetype cards come from the consensus of similar decks;
 *  - if one group runs out of candidates the other fills the remaining slots.
 */
export function selectStructuredSection<T extends StructuredSlot>(ctx: StructuredContext<T>): Array<StructuredPick<T>> {
  const gap = Math.max(ctx.gap, 0);
  if (gap === 0) return [];
  const adjust = ctx.adjust ?? (() => 1);

  const consensus = new Map<string, T>();
  for (const slot of ctx.slots) consensus.set(`${slot.cardId}:${slot.copy}`, slot);

  type Scored = { slot: T; score: number; staple: StapleEntry | null };
  const staplePool: Scored[] = [];
  const specificPool: Scored[] = [];

  for (const slot of ctx.slots) {
    const entry = ctx.staples.get(slot.cardId) ?? null;
    if (entry) continue; // staples are scored below, with their format-wide copy shares
    specificPool.push({ slot, score: slot.probability * adjust(slot), staple: null });
  }
  for (const [cardId, entry] of ctx.staples) {
    const have = ctx.have(cardId);
    for (let copy = have + 1; copy <= MAX_COPIES; copy++) {
      const fromDecks = consensus.get(`${cardId}:${copy}`);
      const formatShare = entry.copyShare[copy - 1] ?? 0;
      const probability = STAPLE_FORMAT_WEIGHT * formatShare + (1 - STAPLE_FORMAT_WEIGHT) * (fromDecks?.probability ?? 0);
      if (probability <= 0) continue;
      const slot = fromDecks ?? ctx.makeSlot(cardId, copy, probability);
      staplePool.push({ slot, score: probability * adjust(slot), staple: entry });
    }
  }

  const byScore = (a: Scored, b: Scored): number => b.score - a.score || a.slot.copy - b.slot.copy || a.slot.cardId - b.slot.cardId;
  staplePool.sort(byScore);
  specificPool.sort(byScore);

  const stapleTarget = Math.round(stapleBudgetShare(ctx.matchedSections, ctx.weights, ctx.staples) * gap);
  const picks: Array<StructuredPick<T>> = [];
  const taken = new Map<number, number>();

  /** Copy k+1 of a card is only valid once copy k is in (or the user already has it). */
  const tryTake = (item: Scored): boolean => {
    const have = ctx.have(item.slot.cardId);
    const already = taken.get(item.slot.cardId) ?? 0;
    if (item.slot.copy !== have + already + 1) return false;
    taken.set(item.slot.cardId, already + 1);
    picks.push({ slot: item.slot, staple: item.staple });
    return true;
  };
  const fill = (pool: Scored[], limit: number): void => {
    let added = 0;
    // repeat passes so that a skipped copy can be taken once its predecessor was
    for (let pass = 0; pass < MAX_COPIES && added < limit; pass++) {
      for (const item of pool) {
        if (added >= limit) break;
        if (picks.some((p) => p.slot === item.slot)) continue;
        if (tryTake(item)) added++;
      }
    }
  };

  fill(staplePool, Math.min(stapleTarget, gap));
  fill(specificPool, gap - picks.length);
  // spill: whichever group still has candidates completes the section
  if (picks.length < gap) fill(staplePool, gap - picks.length);
  if (picks.length < gap) fill(specificPool, gap - picks.length);
  return picks;
}
