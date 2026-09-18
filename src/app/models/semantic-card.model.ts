/** Frontend mirror of tools/card-knowledge-db/src/semantic-model.ts (Pillar 1). */

export const CARD_ROLES = [
  'starter',
  'extender',
  'handtrap',
  'boardbreaker',
  'garnet',
  'engine_piece',
  'floodgate',
] as const;
export type CardRole = (typeof CARD_ROLES)[number];

export type CardTrigger =
  | 'on_normal_summon'
  | 'on_special_summon'
  | 'on_main_phase'
  | 'on_draw_phase'
  | 'on_opponent_activation'
  | 'on_card_destroyed'
  | 'sent_to_grave'
  | 'banished_from_grave'
  | 'in_hand'
  | 'anytime';

export type CardOutcome =
  | 'search_deck'
  | 'special_summon'
  | 'normal_summon_extra'
  | 'destroy_card'
  | 'negate_effect'
  | 'banish'
  | 'draw_card'
  | 'mill'
  | 'bounce_to_hand'
  | 'bounce_to_deck'
  | 'gain_lp'
  | 'inflict_damage';

export interface CardCostFlags {
  discardsForCost: boolean;
  tributesForCost: boolean;
  banishesForCost: boolean;
}

export interface CardRestrictions {
  restrictsSummonToAttribute?: string;
  restrictsSummonToRace?: string;
  restrictsSummonToType?: string;
  restrictsSummonToArchetype?: string;
}

export interface SemanticCardProfile {
  roles: CardRole[];
  triggers: CardTrigger[];
  outcomes: CardOutcome[];
  costFlags: CardCostFlags;
  restrictions: CardRestrictions;
  mentionsCardIds: number[];
}

export interface SemanticIndex {
  version: number;
  generatedAt: string;
  cardCount: number;
  profiles: Record<string, SemanticCardProfile>;
}

export function hasAnyRestriction(restrictions: CardRestrictions): boolean {
  return Object.values(restrictions).some((value) => value !== undefined);
}
