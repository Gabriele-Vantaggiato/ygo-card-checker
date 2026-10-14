export interface DeckBuilderIdentity {
  hasIdentity: boolean;
  archetypes: string[];
}

export interface DeckBuilderAdd {
  cardId: number;
  name: string;
  quantity: number;
  type: string;
  imageUrlSmall: string | null;
  reason: string;
  section: 'main' | 'extra' | 'side';
}

export type DeckBuilderStatus = 'ready' | 'already_complete' | 'empty_deck' | 'no_candidates';

/** Set when the plan was built from real decks of the format's curated pool. */
export interface DeckBuilderPoolSource {
  deckName: string;
  deckUrl: string | null;
  /** Share (0..1) of the user's cards found in the best-matching deck. */
  coverage: number;
  matchedDecks: number;
}

/** Opening-hand odds of the completed main deck, from the cards whose role is known. */
export interface DeckBuilderHandStats {
  /** Main deck size after the completion. */
  mainSize: number;
  starters: number;
  handTraps: number;
  /** P(at least one starter / hand trap in a 5-card opening hand), 0..1. */
  starterOdds: number;
  handTrapOdds: number;
  /** Main cards with known role metadata vs total, to show how reliable the estimate is. */
  knownCards: number;
}

/** Competitive quality of the completed main deck, next to the format's tournament average. */
export interface DeckBuilderCompetitiveStats {
  brickRate: number;
  engineSynergy: number;
  consistency: number;
  usage: number;
  /** Same measures averaged over the format's tournament decks, for comparison. */
  reference: { brickRate: number; engineSynergy: number; consistency: number; usage: number } | null;
}

export interface DeckBuilderPlan {
  status: DeckBuilderStatus;
  identity: DeckBuilderIdentity;
  targetMain: number;
  currentMain: number;
  currentExtra: number;
  currentSide: number;
  adds: DeckBuilderAdd[];
  /** True when a model ranking was accepted (local E5 or configured Gemini).
   * False means the deterministic co-occurrence fallback was used. */
  aiUsed: boolean;
  poolSource?: DeckBuilderPoolSource;
  handStats?: DeckBuilderHandStats;
  competitive?: DeckBuilderCompetitiveStats;
}

export interface DeckBuilderOptions {
  targetMain: number;
  includeSide: boolean;
  targetSide: number;
}
