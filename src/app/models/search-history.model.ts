import { BanlistStatus } from './ygo-format.model';
import { LegalityVerdict } from './ygo-card.model';

export interface SearchHistoryEntry {
  id: number;
  name: string;
  type: string;
  imageUrlSmall: string | null;
  formatId: string;
  verdict: LegalityVerdict | null;
  banlistStatus: BanlistStatus | null;
}
