import { BanlistStatus } from './ygo-format.model';
import { LegalityVerdict } from './ygo-card.model';

export type DeckSection = 'main' | 'extra' | 'side';

export interface DecklistCard {
  id: number;
  name: string;
  type: string;
  imageUrlSmall: string | null;
  quantity: number;
  section?: DeckSection;
  banlistStatus?: BanlistStatus | null;
  legalityVerdict?: LegalityVerdict | null;
}

export interface Decklist {
  id: string;
  name: string;
  updatedAt: string;
  cards: DecklistCard[];
}

export interface DecklistStorage {
  activeId: string | null;
  decklists: Decklist[];
}

export interface AddToDecklistPayload {
  id: number;
  name: string;
  type: string;
  imageUrlSmall: string | null;
  section?: DeckSection;
  banlistStatus?: BanlistStatus | null;
  legalityVerdict?: LegalityVerdict | null;
}

export function maxCopiesForStatus(status: BanlistStatus | null | undefined): number {
  switch (status) {
    case 'Forbidden':
      return 0;
    case 'Limited':
      return 1;
    case 'Semi-Limited':
      return 2;
    default:
      return 3;
  }
}
