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

export interface CardSet {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_rarity_code?: string;
  set_price?: string;
}

export interface CardPrice {
  cardmarket_price?: string;
  tcgplayer_price?: string;
  ebay_price?: string;
  amazon_price?: string;
  coolstuffinc_price?: string;
}

export interface YgoCard {
  id: number;
  name: string;
  type: string;
  desc: string;
  archetype?: string;
  race?: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
  card_images: CardImage[];
  banlist_info?: BanlistInfo;
  misc_info?: MiscInfo[];
  card_sets?: CardSet[];
  card_prices?: CardPrice[];
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
