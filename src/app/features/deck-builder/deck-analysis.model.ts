/** Fixed, deckbuilding-standard functional roles — never derived from text patterns,
 *  only used as a closed vocabulary the LLM classifies real deck cards into. */
export const DECK_ROLE_CATEGORIES = [
  { id: 'starters', labelKey: 'deckBuilder.role.starters' },
  { id: 'extenders', labelKey: 'deckBuilder.role.extenders' },
  { id: 'handtraps', labelKey: 'deckBuilder.role.handtraps' },
  { id: 'gyRecursion', labelKey: 'deckBuilder.role.gyRecursion' },
  { id: 'removalControl', labelKey: 'deckBuilder.role.removalControl' },
  { id: 'searchers', labelKey: 'deckBuilder.role.searchers' },
] as const;

export type DeckRoleCategoryId = (typeof DECK_ROLE_CATEGORIES)[number]['id'];

export interface DeckRoleCardRef {
  cardId: number;
  name: string;
}

export interface DeckAnalysisSuggestion {
  cardId: number;
  name: string;
  imageUrlSmall: string | null;
  reason: string;
}

export interface DeckRoleAnalysis {
  id: DeckRoleCategoryId;
  labelKey: string;
  cardsInDeck: DeckRoleCardRef[];
  suggestions: DeckAnalysisSuggestion[];
}

export type DeckAnalysisStatus = 'ready' | 'empty_deck' | 'unavailable';

export interface DeckAnalysis {
  status: DeckAnalysisStatus;
  roles: DeckRoleAnalysis[];
  aiUsed: boolean;
}
