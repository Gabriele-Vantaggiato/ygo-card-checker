export type TagSource = 'rule' | 'llm' | 'manual';
export type RelationMethod = 'rule' | 'llm' | 'embedding';

export interface YgoProDeckCard {
  id: number;
  name: string;
  type: string;
  desc: string;
  race?: string;
  attribute?: string;
  level?: number;
  archetype?: string;
  atk?: number;
  def?: number;
  banlist_info?: { ban_tcg?: string };
  misc_info?: Array<{ tcg_date?: string }>;
}

export interface CardRow {
  id: number;
  name: string;
  type: string;
  race: string | null;
  attribute: string | null;
  level: number | null;
  archetype: string | null;
  desc_en: string;
  desc_it: string | null;
  atk: number | null;
  def: number | null;
  tcg_date: string | null;
  ban_tcg: string | null;
  synced_at: string;
}

export interface CardTagRow {
  card_id: number;
  tag: string;
  confidence: number;
  source: TagSource;
  created_at: string;
}

export interface SyncMeta {
  totalCards: number;
  syncedAt: string;
  apiVersion: string;
  languages: string[];
}
