/** Language-independent observable actions shared by replay and Flow. Not effect resolution. */
export type DuelActionKind = 'normal_summon' | 'special_summon' | 'activate' | 'set';
export interface DuelLineAction {
  kind: DuelActionKind;
  cardId: number;
}
export interface ObservedLine {
  replayId: string;
  deckKey: string;
  masterRule: number;
  turn: number;
  openingHand: number[];
  actions: DuelLineAction[];
  won: boolean | null;
  uninterrupted: boolean;
}
export interface LineEvidence {
  actions: DuelLineAction[];
  games: number;
  wins: number;
  losses: number;
  unknownResults: number;
  /** Smoothed game outcome association, not causal combo success. */
  winRate: number | null;
}
export interface LineComparison {
  turn: number;
  status: 'matched' | 'deviation' | 'inconclusive';
  reason: string;
  played: DuelLineAction[];
  recommended: DuelLineAction[];
  missing: DuelLineAction[];
  evidenceGames: number;
  /** Structural comparison never proves that a different play is a mistake. */
  provenMisplay: false;
}
