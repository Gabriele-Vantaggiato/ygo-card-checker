import { ComboFlow } from '../models/combo-flow.model';
import { DetectedEngine } from '../models/combo-engine.model';

/**
 * Pillar 4 core algorithm: a Flow surfaces only when its gate is actually satisfied —
 * either its engine was detected in the deck, or every one of its explicit key cards
 * is present. Never a partial match.
 */
export function getAvailableFlows(
  deckCardIds: ReadonlySet<number>,
  flows: readonly ComboFlow[],
  detectedEngines: readonly DetectedEngine[],
): ComboFlow[] {
  const detectedEngineKeys = new Set(detectedEngines.map((detected) => detected.engine.key));

  return flows.filter((flow) => {
    if (flow.engineKey) {
      return detectedEngineKeys.has(flow.engineKey);
    }
    if (flow.keyCards.length > 0) {
      return flow.keyCards.every((keyCard) => deckCardIds.has(keyCard.cardId));
    }
    return false;
  });
}
