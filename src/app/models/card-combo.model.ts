export interface ComboRequirement {
  kind: 'control';
  minLevel: number;
  names: string[];
}

export interface ComboPayoffDeck {
  kind: 'special_summon_deck';
  minLevel: number;
  names: string[];
  position: 'defense' | 'attack' | 'any';
}

export interface ComboPayoffSelfTribute {
  kind: 'self_summon_hand_tribute_atk';
  tributeCount: number;
  minAtk: number;
}

export type ComboPayoff = ComboPayoffDeck | ComboPayoffSelfTribute;

export type ComboPartnerRole =
  | 'satisfies_requirement'
  | 'puts_on_field'
  | 'summon_target'
  | 'tribute_fodder'
  | 'summon_support'
  | 'enabled_card';

export interface ComboPartnerRecord {
  id: number;
  name: string;
  role: ComboPartnerRole;
  score: number;
  tcgDate?: string | null;
  banTcg?: string | null;
  imageSmall: string;
}

export interface ComboPartner extends ComboPartnerRecord {
  reasonKey: string;
  reasonParams?: Record<string, string>;
}

export interface ComboStep {
  role: 'enabler' | 'source' | 'target';
  cardId: number;
  name: string;
  reasonKey: string;
  reasonParams?: Record<string, string>;
  imageSmall: string;
}

export interface ComboLine {
  id: string;
  steps: ComboStep[];
}

export interface ComboEntry {
  requirements: ComboRequirement[];
  payoffs: ComboPayoff[];
  enablers: ComboPartnerRecord[];
  targets: ComboPartnerRecord[];
  lines: ComboLine[];
}

export interface ComboIndex {
  version: number;
  generatedAt: string;
  cardCount: number;
  entries: Record<string, ComboEntry>;
}

export interface ComboResult {
  requirements: ComboRequirement[];
  payoffs: ComboPayoff[];
  enablers: ComboPartner[];
  targets: ComboPartner[];
  lines: ComboLine[];
  available: boolean;
}
