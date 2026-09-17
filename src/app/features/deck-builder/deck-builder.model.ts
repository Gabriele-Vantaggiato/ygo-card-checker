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

export interface DeckBuilderPlan {
  status: DeckBuilderStatus;
  identity: DeckBuilderIdentity;
  targetMain: number;
  currentMain: number;
  currentExtra: number;
  currentSide: number;
  adds: DeckBuilderAdd[];
  /** True when Gemini actually produced the ranking/reasoning; false = deterministic
   *  co-occurrence-only fallback was used (no key configured, or the call failed). */
  aiUsed: boolean;
}

export interface DeckBuilderOptions {
  targetMain: number;
  includeSide: boolean;
  targetSide: number;
}
