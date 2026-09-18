/** Pillar 3: modular engine detection. Named ComboEngine to avoid colliding with the
 * existing AssistanceEngine (CardKnowledgeIndexService.engineFor / 'engine' relation kind). */

export interface ComboEngineCard {
  cardId: number;
  name: string;
  role: 'core' | 'support';
  minCopies: number;
}

export interface ComboEngine {
  key: string;
  name: string;
  description: string | null;
  minCardsThreshold: number;
  cards: ComboEngineCard[];
}

export interface ComboEngineIndex {
  version: number;
  generatedAt: string;
  engines: ComboEngine[];
}

export interface DetectedEngine {
  engine: ComboEngine;
  matchedCardIds: number[];
  matchedCount: number;
  /** matchedCount / minCardsThreshold, clamped to >=1 for a satisfied engine. */
  completeness: number;
}
