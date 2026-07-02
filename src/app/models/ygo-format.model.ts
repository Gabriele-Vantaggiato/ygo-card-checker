export type BanlistStatus = 'Forbidden' | 'Limited' | 'Semi-Limited' | 'Unlimited';

export type BanlistSource = 'ban_goat' | 'ban_tcg' | 'local';

export interface LocalizedText {
  it: string;
  en: string;
}

export interface YgoFormat {
  id: string;
  name: LocalizedText;
  banlistId: string | null;
  banlistEffectiveDate: string | null;
  cardPoolEndDate: string | null;
  cardPoolStartDate: string;
  banlistSource: BanlistSource;
  description: LocalizedText;
}

export interface BanlistSnapshot {
  id: string;
  effectiveDate: string;
  cards: Record<string, BanlistStatus>;
  nameIndex: Record<string, BanlistStatus>;
}
