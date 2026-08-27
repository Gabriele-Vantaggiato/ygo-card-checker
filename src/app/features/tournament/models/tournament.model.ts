export type TournamentStructure = 'single-elim' | 'double-elim' | 'swiss' | 'round-robin';

/** Win / draw / loss point values used for standings. */
export type ScoringSystem = '3-1-0' | '2-1-0' | 'match-wins';

export type MatchResult = 'pending' | 'player1' | 'player2' | 'draw';

export type TournamentPhase = 'setup' | 'active' | 'completed';

export interface TournamentPlayer {
  id: string;
  name: string;
  seed: number;
  dropped: boolean;
}

export interface TournamentMatch {
  id: string;
  round: number;
  /** Bracket slot index for elimination formats. */
  slot?: number;
  player1Id: string | null;
  player2Id: string | null;
  isBye: boolean;
  result: MatchResult;
  table: number;
}

export interface TournamentRound {
  number: number;
  matches: TournamentMatch[];
  status: 'pending' | 'active' | 'completed';
}

export interface StandingRow {
  playerId: string;
  points: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  byes: number;
  /** Opponent match win percentage (0–1). */
  omw: number;
  /** Game win percentage placeholder — same as match win % when games aren't tracked. */
  gw: number;
}

export interface Tournament {
  id: string;
  name: string;
  structure: TournamentStructure;
  scoring: ScoringSystem;
  /** Total Swiss rounds (Swiss only). */
  swissRounds: number;
  phase: TournamentPhase;
  players: TournamentPlayer[];
  rounds: TournamentRound[];
  createdAt: string;
}

export interface TournamentSetupInput {
  name: string;
  structure: TournamentStructure;
  scoring: ScoringSystem;
  swissRounds?: number;
  playerNames: string[];
}

export const SCORING_PRESETS: Record<
  ScoringSystem,
  { win: number; draw: number; loss: number; byeAsWin: boolean }
> = {
  '3-1-0': { win: 3, draw: 1, loss: 0, byeAsWin: true },
  '2-1-0': { win: 2, draw: 1, loss: 0, byeAsWin: true },
  'match-wins': { win: 1, draw: 0, loss: 0, byeAsWin: true },
};
