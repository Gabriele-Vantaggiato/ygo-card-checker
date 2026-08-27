import { Injectable, computed, signal } from '@angular/core';
import {
  MatchResult,
  ScoringSystem,
  Tournament,
  TournamentPhase,
  TournamentPlayer,
  TournamentSetupInput,
  TournamentStructure,
} from '../models/tournament.model';
import {
  advanceRoundIfReady,
  applyMatchResult,
  canAdvanceRound,
  computeStandings,
  createPlayerId,
  generateInitialRound,
  isTournamentComplete,
  playerName,
  suggestedRoundCount,
  suggestedSwissRounds,
} from '../utils/tournament-engine.utils';

@Injectable({ providedIn: 'root' })
export class TournamentStore {
  private readonly tournament = signal<Tournament | null>(null);

  readonly active = computed(() => this.tournament());
  readonly phase = computed(() => this.tournament()?.phase ?? 'setup');
  readonly hasTournament = computed(() => this.tournament() !== null);
  readonly currentRound = computed(() => {
    const t = this.tournament();
    if (!t || t.rounds.length === 0) {
      return null;
    }
    return t.rounds[t.rounds.length - 1] ?? null;
  });
  readonly standings = computed(() => {
    const t = this.tournament();
    return t ? computeStandings(t) : [];
  });
  readonly canAdvance = computed(() => {
    const t = this.tournament();
    return t ? canAdvanceRound(t) : false;
  });
  readonly isComplete = computed(() => {
    const t = this.tournament();
    return t ? isTournamentComplete(t) : false;
  });

  playerName(playerId: string | null): string {
    const t = this.tournament();
    return t ? playerName(t, playerId) : '—';
  }

  suggestedSwissRounds(playerCount: number): number {
    return suggestedSwissRounds(playerCount);
  }

  suggestedRoundCount(structure: TournamentStructure, playerCount: number): number {
    return suggestedRoundCount(structure, playerCount);
  }

  reset(): void {
    this.tournament.set(null);
  }

  startTournament(input: TournamentSetupInput): boolean {
    const names = input.playerNames.map((n) => n.trim()).filter(Boolean);
    if (names.length < 2) {
      return false;
    }

    const uniqueNames = [...new Set(names)];
    const players: TournamentPlayer[] = uniqueNames.map((name, index) => ({
      id: createPlayerId(),
      name,
      seed: index + 1,
      dropped: false,
    }));

    const swissRounds =
      input.swissRounds ??
      (input.structure === 'swiss' ? suggestedSwissRounds(players.length) : 0);

    const draft: Tournament = {
      id: crypto.randomUUID(),
      name: input.name.trim() || 'Torneo',
      structure: input.structure,
      scoring: input.scoring,
      swissRounds,
      phase: 'setup',
      players,
      rounds: [],
      createdAt: new Date().toISOString(),
    };

    const firstRound = generateInitialRound(draft);
    this.tournament.set({
      ...draft,
      phase: 'active',
      rounds: [firstRound],
    });
    return true;
  }

  setMatchResult(matchId: string, result: MatchResult): void {
    this.tournament.update((t) => {
      if (!t) {
        return t;
      }
      return applyMatchResult(t, matchId, result);
    });
  }

  advanceRound(): void {
    this.tournament.update((t) => {
      if (!t) {
        return t;
      }
      return advanceRoundIfReady(t);
    });
  }

  dropPlayer(playerId: string): void {
    this.tournament.update((t) => {
      if (!t) {
        return t;
      }
      return {
        ...t,
        players: t.players.map((p) => (p.id === playerId ? { ...p, dropped: true } : p)),
      };
    });
  }
}

export type { TournamentPhase, TournamentStructure, ScoringSystem, MatchResult };
