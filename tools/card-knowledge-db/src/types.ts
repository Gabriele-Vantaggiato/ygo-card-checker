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
  frameType?: string;
  linkval?: number;
  scale?: number;
  linkmarkers?: string[];
  banlist_info?: { ban_tcg?: string; ban_goat?: string };
  misc_info?: Array<{ tcg_date?: string; formats?: string[] }>;
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
  ban_goat: string | null;
  formats_json: string | null;
  frame_type: string | null;
  link_val: number | null;
  pendulum_scale: number | null;
  is_extra_deck: number;
  synced_at: string;
}

export interface CardTagRow {
  card_id: number;
  tag: string;
  confidence: number;
  source: TagSource;
  created_at: string;
}

export interface CardEffectRow {
  card_id: number;
  effect_kind: string;
  payload_json: string;
  source: TagSource;
  created_at: string;
}

export interface SyncMeta {
  totalCards: number;
  syncedAt: string;
  apiVersion: string;
  languages: string[];
}
