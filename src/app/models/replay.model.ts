/** Structured duel extracted from a `.yrp3d` (or later other sources). */

export interface ReplayDeckSection {
  main: number[];
  extra: number[];
  side: number[];
}

export interface ReplayDeckPair {
  focus: ReplayDeckSection;
  opponent: ReplayDeckSection;
}

export type ReplayEventKind =
  | 'draw'
  | 'new_turn'
  | 'new_phase'
  | 'summon'
  | 'sp_summon'
  | 'set'
  | 'chain'
  | 'attack'
  | 'damage'
  | 'recover'
  | 'missed_effect'
  | 'win';

export interface ReplayEvent {
  kind: ReplayEventKind;
  /** Controller index in the replay (0/1), when known. */
  controller?: number;
  code?: number;
  value?: number;
  turn?: number;
  phase?: number;
  rawType: string;
  /** Visible drawn passcodes; zero/hidden cards are retained to detect incomplete hands. */
  cards?: number[];
}

export interface ParsedReplay {
  fileName: string;
  sha256: string;
  byteLength: number;
  focusName: string;
  opponentName: string;
  /** Local/focus player controller (from MSG_START.playerType). */
  focusController: number;
  masterRule: number;
  startLp: number;
  turnCount: number;
  winnerController: number | null;
  /** Win reason code from MSG_WIN.type when present. */
  winReason: number | null;
  focusWon: boolean | null;
  decks: ReplayDeckPair | null;
  events: ReplayEvent[];
  /** Distinct card codes the focus player interacted with (summon/chain/draw/set). */
  focusInteractedCodes: number[];
  messageCount: number;
  hasEmbeddedYrp: boolean;
}

export type MissplaySeverity = 'info' | 'warn' | 'critical';

export type MissplayKind =
  | 'missed_effect'
  | 'suboptimal_line'
  | 'unused_deck_card'
  | 'short_loss'
  | 'no_interaction'
  | 'scoop_or_early_end';

export interface MissplayFinding {
  kind: MissplayKind;
  severity: MissplaySeverity;
  /** i18n key under replay.findings.* */
  titleKey: string;
  /** i18n key under replay.findings.* */
  detailKey: string;
  code?: number;
  count?: number;
  meta?: Record<string, string | number>;
}

export interface ReplayAnalysis {
  lineComparisons?: import('./duel-line.model').LineComparison[];
  replay: ParsedReplay;
  findings: MissplayFinding[];
  stats: {
    summons: number;
    spSummons: number;
    chains: number;
    attacks: number;
    missedEffects: number;
    damageTaken: number;
    damageDealt: number;
  };
  /** Filled by store after restriction catalog load. */
  restrictionTrace?: import('./replay-restriction.model').RestrictionTrace;
}

/**
 * Trimmed, persistable record of a past analysis for the browsable local history —
 * unlike ReplayAnalysis, deliberately drops `replay.events`/`decks` (the full duel log
 * and deck lists) so a long history does not balloon localStorage.
 */
export interface ReplayHistoryEntry {
  sha256: string;
  fileName: string;
  focusName: string;
  opponentName: string;
  focusWon: boolean | null;
  turnCount: number;
  masterRule: number;
  savedAt: string;
  stats: ReplayAnalysis['stats'];
  findings: MissplayFinding[];
  lineComparisons: import('./duel-line.model').LineComparison[];
}

export interface DeckAdviceItem {
  code: number;
  /** How many analyzed replays listed this card unused (or problematic). */
  replayHits: number;
  reasonKey: string;
}

export interface ReplayDeckAdvice {
  items: DeckAdviceItem[];
  replaysUsed: number;
  focusName: string;
}

export interface ReplaySlot {
  id: 'primary' | 'extra1' | 'extra2';
  file: File | null;
  errorKey: string | null;
}
