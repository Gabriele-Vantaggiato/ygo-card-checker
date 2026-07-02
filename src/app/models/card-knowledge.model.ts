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

export interface CardKnowledgeEntry {
  tags: string[];
  series: string[];
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
}

export interface CardRelatedResult {
  tags: string[];
  series: string[];
  suggestions: CardRelatedSuggestion[];
  available: boolean;
}
