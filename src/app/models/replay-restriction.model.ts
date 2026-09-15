/** Extensible Yu-Gi-Oh restriction catalog for replay legality / coaching briefs. */

export type RestrictionKind =
  | 'cannot_special_summon'
  | 'cannot_normal_summon_or_set'
  | 'cannot_special_summon_from_extra'
  | 'cannot_special_summon_from_hand'
  | 'cannot_special_summon_from_deck'
  | 'cannot_special_summon_from_gy'
  | 'cannot_activate_monster_effects'
  | 'cannot_activate_spell_trap'
  | 'cannot_conduct_battle_phase'
  | 'cards_to_gy_are_banished'
  | 'draw_instead_excavates'
  | 'other';

export type RestrictionUntil =
  | 'end_of_turn'
  | 'end_of_next_turn'
  | 'while_controlled'
  | 'rest_of_duel';

export type RestrictionScope = 'controller' | 'both' | 'opponent';

export interface RestrictionEffect {
  kind: RestrictionKind;
  scope: RestrictionScope;
  until: RestrictionUntil;
  note?: string;
}

export interface RestrictionCardEntry {
  name: string;
  /** Tags for grouping / search in tooling. */
  tags?: string[];
  /** Applied when this card is activated (MSG_CHAINING). */
  onActivate?: RestrictionEffect[];
  /** Human summary for coaches / briefs. */
  summary?: string;
  /** Optional: activation is illegal if these player flags are already true. */
  blockedIf?: Array<'special_summoned_this_turn' | 'normal_summoned_this_turn'>;
}

export interface RestrictionCatalog {
  version: number;
  /** Design note: YGO is too large for exhaustiveness — extend cards{} over time. */
  coverageNote: string;
  kinds: RestrictionKind[];
  cards: Record<string, RestrictionCardEntry>;
}

export interface ActiveRestriction {
  kind: RestrictionKind;
  sourceCode: number;
  sourceName: string;
  controller: number;
  scope: RestrictionScope;
  until: RestrictionUntil;
  appliedTurn: number;
  note?: string;
}

export type RestrictionAnnotationKind =
  | 'lock_applied'
  | 'lock_cleared'
  | 'engine_flag_explained'
  | 'illegal_under_lock';

export interface RestrictionAnnotation {
  kind: RestrictionAnnotationKind;
  turn: number;
  code?: number;
  message: string;
  relatedKinds?: RestrictionKind[];
}

export interface RestrictionTrace {
  annotations: RestrictionAnnotation[];
  /** Snapshot of locks that were active for the focus player at any point. */
  focusLocksSeen: ActiveRestriction[];
  /** Compact lines for Gemini brief. */
  timelineNotes: string[];
}

export interface ReplayCoachBrief {
  version: number;
  fileName: string;
  focusName: string;
  opponentName: string;
  focusWon: boolean | null;
  turnCount: number;
  stats: ReplayAnalysisStats;
  legalLocks: string[];
  timelineNotes: string[];
  engineFlagsExplained: string[];
  heuristicFindings: string[];
  instructions: string[];
}

export interface ReplayAnalysisStats {
  summons: number;
  spSummons: number;
  chains: number;
  attacks: number;
  missedEffects: number;
  damageTaken: number;
  damageDealt: number;
}
