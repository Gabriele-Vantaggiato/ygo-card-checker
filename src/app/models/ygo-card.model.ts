import { BanlistStatus } from './ygo-format.model';

export interface CardImage {
  id: number;
  image_url: string;
  image_url_small: string;
}

export interface BanlistInfo {
  ban_tcg?: BanlistStatus;
  ban_ocg?: BanlistStatus;
  ban_goat?: BanlistStatus;
}

export interface MiscInfo {
  tcg_date?: string;
  formats?: string[];
}

export interface YgoCard {
  id: number;
  name: string;
  type: string;
  desc: string;
  card_images: CardImage[];
  banlist_info?: BanlistInfo;
  misc_info?: MiscInfo[];
}

export interface CardInfoMeta {
  total_rows?: number;
  current_rows?: number;
  rows_remaining?: number;
  next_page?: string;
  next_page_offset?: number;
}

export interface CardInfoResponse {
  data: YgoCard[];
  meta?: CardInfoMeta;
}

export type LegalityVerdict = 'legal' | 'not-legal' | 'restricted';

export interface LegalityReason {
  key: string;
  params?: Record<string, string>;
}

export interface LegalityResult {
  verdict: LegalityVerdict;
  banlistStatus: BanlistStatus;
  tcgDate: string | null;
  reasons: LegalityReason[];
}
