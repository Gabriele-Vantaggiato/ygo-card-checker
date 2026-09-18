/** Pillar 5: smart recommendation service. */
import { CardRole } from './semantic-card.model';

export interface SynergyIndex {
  version: number;
  generatedAt: string;
  totalDecks: number;
  partners: Record<string, Array<{ cardId: number; deckCount: number }>>;
}

export interface RecommendedCard {
  cardId: number;
  name: string;
  imageSmall: string;
  score: number;
  deckCount: number;
  roles: CardRole[];
  /** Multiplier applied for role balancing (>1 boosted, <1 deprioritized). */
  roleBoost: number;
}

export interface GetSuggestionsOptions {
  limit?: number;
  /** Excluded outright — e.g. cards already at 3 copies, or format-banned. */
  excludeCardIds?: ReadonlySet<number>;
}
