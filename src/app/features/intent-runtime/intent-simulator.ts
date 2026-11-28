/** Pure, deterministic capability implementation. No LLM or Yu-Gi-Oh! rule guesses. */
import type { DecklistCard } from '../../models/decklist.model';

export interface SimulationCard {
  id: number;
  name: string;
  quantity: number;
  imageUrlSmall: string | null;
}

export interface DrawnHand {
  cardIds: number[];
  occurrences: number;
}

export interface SimulationOutput {
  seed: number;
  samples: number;
  handSize: number;
  deckSize: number;
  starterIds: number[];
  brickRate: number | null;
  starterDistribution: number[];
  appearances: Array<{ id: number; name: string; hits: number; probability: number }>;
  mostCommonHands: DrawnHand[];
  exampleHands: number[][];
  deckFingerprint: string;
}

export interface SimulationInput {
  cards: readonly SimulationCard[];
  samples: number;
  handSize: number;
  starterIds: readonly number[];
  seed: number;
}

export function mainDeckSnapshot(cards: readonly DecklistCard[]): SimulationCard[] {
  // Keep section semantics consistent with the existing YdkeService, without
  // importing Angular runtime code into this pure simulation module.
  return cards.filter((card) => (card.section ?? (/Fusion|Synchro|Synchron|Xyz|XYZ|Link/i.test(card.type) ? 'extra' : 'main')) === 'main' && card.quantity > 0)
    .map(({ id, name, quantity, imageUrlSmall }) => ({ id, name, quantity, imageUrlSmall }));
}

/** Stable key for identifying when an analysis is stale after a deck edit. */
export function deckFingerprint(cards: readonly SimulationCard[]): string {
  return cards.map((card) => `${card.id}:${card.quantity}`).sort().join('|');
}

export function simulateOpeningHands(input: SimulationInput): SimulationOutput {
  const samples = Math.floor(input.samples);
  const handSize = Math.floor(input.handSize);
  if (!Number.isFinite(samples) || samples < 1 || samples > 100_000) throw new RangeError('Simulation count must be between 1 and 100,000');
  if (!Number.isFinite(handSize) || handSize < 1 || handSize > 6) throw new RangeError('Hand size must be between 1 and 6');

  const ids: number[] = [];
  const names = new Map<number, string>();
  for (const card of input.cards) {
    if (!Number.isInteger(card.quantity) || card.quantity < 0 || card.quantity > 3) throw new RangeError('Invalid card quantity');
    if (!Number.isSafeInteger(card.id) || card.id <= 0) throw new RangeError('Invalid card id');
    for (let i = 0; i < card.quantity; i++) ids.push(card.id);
    names.set(card.id, card.name);
  }
  if (ids.length < handSize) throw new RangeError('The main deck has fewer cards than the starting hand');

  const allowed = new Set(ids);
  const starterIds = [...new Set(input.starterIds)].filter((id) => allowed.has(id));
  const starters = new Set(starterIds);
  const hasCriteria = starters.size > 0;
  let bricks = 0;
  const starterDistribution = Array.from({ length: handSize + 1 }, () => 0);
  const appearanceCounts = new Map<number, number>();
  const hands = new Map<string, DrawnHand>();
  const exampleHands: number[][] = [];
  let state = (Number.isFinite(input.seed) ? input.seed : 1) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  const seed = state;
  const nextRandom = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };

  for (let sample = 0; sample < samples; sample++) {
    const pool = ids.slice();
    const hand: number[] = [];
    let starterCount = 0;
    for (let i = 0; i < handSize; i++) {
      const j = i + Math.floor(nextRandom() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      const drawn = pool[i]!;
      hand.push(drawn);
      if (starters.has(drawn)) starterCount++;
    }
    for (const drawn of new Set(hand)) appearanceCounts.set(drawn, (appearanceCounts.get(drawn) ?? 0) + 1);
    if (hasCriteria && starterCount === 0) bricks++;
    starterDistribution[starterCount]! += 1;
    if (exampleHands.length < 5) exampleHands.push(hand);
    const sorted = hand.slice().sort((a, b) => a - b);
    const key = sorted.join(',');
    const existing = hands.get(key);
    if (existing) existing.occurrences++;
    else hands.set(key, { cardIds: sorted, occurrences: 1 });
  }

  return {
    seed, samples, handSize, deckSize: ids.length, starterIds,
    brickRate: hasCriteria ? bricks / samples : null,
    starterDistribution,
    appearances: [...names.entries()].map(([id, name]) => ({
      id, name, hits: appearanceCounts.get(id) ?? 0,
      probability: (appearanceCounts.get(id) ?? 0) / samples,
    })).sort((a, b) => b.probability - a.probability),
    mostCommonHands: [...hands.values()].sort((a, b) => b.occurrences - a.occurrences).slice(0, 10),
    exampleHands,
    deckFingerprint: deckFingerprint(input.cards),
  };
}
