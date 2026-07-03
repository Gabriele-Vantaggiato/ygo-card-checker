import { DecklistCard } from '../../models/decklist.model';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { DeckSectionKey } from '../../utils/deck-section.utils';
export interface DeckCardGridCell {
  card: DecklistCard;
  verdictShortKey: string | null;
}

export type InspectTarget =
  | { kind: 'deck'; card: DecklistCard }
  | { kind: 'search'; card: YgoCard };

export interface DeckSectionViewModel {
  key: DeckSectionKey;
  titleKey: string;
  emptyKey: string;
  count: number;
  monsters: number;
  spells: number;
  traps: number;
  cards: DecklistCard[];
  expandedCards: DeckCardGridCell[];
}

export interface DeckCardInspectViewModel {
  cardId: number | null;
  name: string;
  type: string;
  imageUrl: string | null;
  desc: string | null;
  descLoading: boolean;
  legality: LegalityResult | null;
  qty: number;
  inDeckLabelKey: string;
  inDeckLabelParams: Record<string, string>;
  canAdd: boolean;
}
