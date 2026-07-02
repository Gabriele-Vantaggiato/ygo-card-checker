export interface CardKnowledgeRelated {
  id: number;
  name: string;
  relation: string;
  score: number;
  archetype: string | null;
  tcgDate: string | null;
  banTcg: string | null;
  imageSmall: string;
}

export interface CardKnowledgeEffect {
  kind: string;
  payload: Record<string, unknown>;
}

export interface CardKnowledgeEntry {
  tags: string[];
  series: string[];
  mentions: string[];
  effects: CardKnowledgeEffect[];
  related: CardKnowledgeRelated[];
}

export interface CardKnowledgeIndex {
  version: number;
  generatedAt: string;
  cardCount: number;
  entries: Record<string, CardKnowledgeEntry>;
}

export interface CardRelatedSuggestion {
  cardId: number;
  name: string;
  relation: string;
  score: number;
  archetype: string | null;
  imageSmall: string;
  reasonKey: string;
  reasonParams?: Record<string, string>;
  maxCopies?: number;
  suggestedQty?: number;
}

export interface FormatLegalityIndex {
  version: number;
  generatedAt: string;
  formats: string[];
  playable: Record<string, string[]>;
  maxCopies: Record<string, Record<string, number>>;
}

export interface CardRelatedGroup {
  relation: string;
  labelKey: string;
  suggestions: CardRelatedSuggestion[];
}

export interface CardKnowledgeDisplayTag {
  id: string;
  labelKey: string;
}

export interface CardRelatedResult {
  tags: string[];
  displayTags: CardKnowledgeDisplayTag[];
  series: string[];
  mentions: string[];
  effects: CardKnowledgeEffect[];
  suggestions: CardRelatedSuggestion[];
  groups: CardRelatedGroup[];
  available: boolean;
}

export interface DeckRelatedResult {
  suggestions: CardRelatedSuggestion[];
  groups: CardRelatedGroup[];
  sourceCount: number;
  available: boolean;
}
