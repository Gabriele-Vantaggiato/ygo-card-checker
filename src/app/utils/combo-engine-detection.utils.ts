import { ComboEngine, DetectedEngine } from '../models/combo-engine.model';

/**
 * Pillar 3 core algorithm. Evaluates every engine independently against the deck —
 * no early exit on first match — so hybrid decks running e.g. both Artifact and
 * Floowandereeze report both engines as detected.
 */
export function detectEngines(
  deckQuantities: ReadonlyMap<number, number>,
  engines: readonly ComboEngine[],
): DetectedEngine[] {
  const detected: DetectedEngine[] = [];

  for (const engine of engines) {
    const matchedCardIds: number[] = [];
    for (const engineCard of engine.cards) {
      const quantityInDeck = deckQuantities.get(engineCard.cardId) ?? 0;
      if (quantityInDeck >= engineCard.minCopies) {
        matchedCardIds.push(engineCard.cardId);
      }
    }

    const matchedCount = matchedCardIds.length;
    if (matchedCount < engine.minCardsThreshold) {
      continue;
    }

    detected.push({
      engine,
      matchedCardIds,
      matchedCount,
      completeness: matchedCount / engine.minCardsThreshold,
    });
  }

  return detected.sort((a, b) => b.completeness - a.completeness);
}
