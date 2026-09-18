/**
 * Pillar 1 entity model: the semantic vocabulary layered on top of the raw `cards` row.
 * Stored as TEXT-JSON columns on `cards` (see CARD_COLUMN_MIGRATIONS in database.ts),
 * following the repo's existing convention (formats_json, setcode_json, babel_strings_json)
 * rather than junction tables, since roles/triggers/outcomes are small closed vocabularies
 * read as a whole per card, never queried by individual tag across the table.
 */

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

export const CARD_TRIGGERS = [
  'on_normal_summon',
  'on_special_summon',
  'on_main_phase',
  'on_draw_phase',
  'on_opponent_activation',
  'on_card_destroyed',
  'sent_to_grave',
  'banished_from_grave',
  'in_hand',
  'anytime',
] as const;
export type CardTrigger = (typeof CARD_TRIGGERS)[number];

export const CARD_OUTCOMES = [
  'search_deck',
  'special_summon',
  'normal_summon_extra',
  'destroy_card',
  'negate_effect',
  'banish',
  'draw_card',
  'mill',
  'bounce_to_hand',
  'bounce_to_deck',
  'gain_lp',
  'inflict_damage',
] as const;
export type CardOutcome = (typeof CARD_OUTCOMES)[number];

/** Xenophobic locks: once active, the deck can only summon/use cards matching the constraint. */
export interface CardRestrictions {
  restrictsSummonToAttribute?: string;
  restrictsSummonToRace?: string;
  restrictsSummonToType?: string;
  restrictsSummonToArchetype?: string;
}

export interface CardCostFlags {
  discardsForCost: boolean;
  tributesForCost: boolean;
  banishesForCost: boolean;
}

export const EMPTY_RESTRICTIONS: CardRestrictions = {};
export const NO_COST_FLAGS: CardCostFlags = {
  discardsForCost: false,
  tributesForCost: false,
  banishesForCost: false,
};

export interface SemanticProfile {
  roles: CardRole[];
  triggers: CardTrigger[];
  outcomes: CardOutcome[];
  costFlags: CardCostFlags;
  restrictions: CardRestrictions;
}

export function emptySemanticProfile(): SemanticProfile {
  return {
    roles: [],
    triggers: [],
    outcomes: [],
    costFlags: { ...NO_COST_FLAGS },
    restrictions: {},
  };
}

export interface SemanticProfileRow {
  card_id: number;
  roles_json: string;
  triggers_json: string;
  outcomes_json: string;
  cost_flags_json: string;
  restrictions_json: string;
}

export function parseSemanticProfileRow(row: SemanticProfileRow): SemanticProfile {
  return {
    roles: JSON.parse(row.roles_json) as CardRole[],
    triggers: JSON.parse(row.triggers_json) as CardTrigger[],
    outcomes: JSON.parse(row.outcomes_json) as CardOutcome[],
    costFlags: JSON.parse(row.cost_flags_json) as CardCostFlags,
    restrictions: JSON.parse(row.restrictions_json) as CardRestrictions,
  };
}
