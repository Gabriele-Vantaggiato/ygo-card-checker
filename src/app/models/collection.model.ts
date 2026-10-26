import { CardSet, YgoCard } from './ygo-card.model';

export const CARD_CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export type CardCondition = (typeof CARD_CONDITIONS)[number];

export const CARD_LANGUAGES = ['EN', 'IT', 'FR', 'DE', 'ES', 'PT', 'JP', 'KR', 'AE'] as const;
export type CardLanguage = (typeof CARD_LANGUAGES)[number];

export interface CollectionItem {
  id: string;
  passcode: number;
  cardName: string;
  setCode: string;
  rarity: string;
  language: CardLanguage;
  condition: CardCondition;
  firstEdition: boolean;
  quantity: number;
  notes: string | null;
  updatedAt: string;
}

export type CollectionDraft = Omit<CollectionItem, 'id' | 'updatedAt'>;

/** A scanned/manual card waiting in the review queue before being saved. */
export interface ScanQueueEntry extends CollectionDraft {
  tempId: string;
  printings: CardSet[];
  needsReview: boolean;
}

export interface ScanDetection {
  card: YgoCard;
  printings: CardSet[];
  setCode: string;
  language: CardLanguage;
  source: 'code' | 'name';
  needsReview: boolean;
}
