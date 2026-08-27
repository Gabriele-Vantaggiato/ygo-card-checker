import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { DuelPanelComponent } from '../../../shared/ui/duel-panel/duel-panel.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import {
  MatchResult,
  ScoringSystem,
  TournamentStructure,
} from '../models/tournament.model';
import { TournamentStore } from '../stores/tournament.store';

type ViewTab = 'matches' | 'standings' | 'bracket';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tournament-page',
  standalone: true,
  imports: [FormsModule, TranslatePipe, PageHeaderComponent, DuelPanelComponent, EmptyStateComponent],
  template: `
    <main class="page-main page-stack max-w-4xl fade-in-panel">
      <app-page-header titleKey="tournament.title" subtitleKey="tournament.subtitle">
        @if (store.hasTournament()) {
          <button type="button" class="btn btn-ghost btn-sm" (click)="resetTournament()">
            {{ 'tournament.reset' | translate }}
          </button>
        }
      </app-page-header>

      @if (!store.hasTournament()) {
        <app-duel-panel [title]="'tournament.setup.title' | translate">
          <div class="space-y-4">
            <label class="form-control w-full">
              <span class="label-text text-sm">{{ 'tournament.setup.name' | translate }}</span>
              <input
                class="input input-bordered input-sm w-full"
                [(ngModel)]="setupName"
                [placeholder]="'tournament.setup.namePlaceholder' | translate"
              />
            </label>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="form-control w-full">
                <span class="label-text text-sm">{{ 'tournament.setup.structure' | translate }}</span>
                <select class="select select-bordered select-sm w-full" [(ngModel)]="setupStructure">
                  @for (opt of structureOptions; track opt.value) {
                    <option [ngValue]="opt.value">{{ opt.labelKey | translate }}</option>
                  }
                </select>
              </label>

              <label class="form-control w-full">
                <span class="label-text text-sm">{{ 'tournament.setup.scoring' | translate }}</span>
                <select class="select select-bordered select-sm w-full" [(ngModel)]="setupScoring">
                  @for (opt of scoringOptions; track opt.value) {
                    <option [ngValue]="opt.value">{{ opt.labelKey | translate }}</option>
                  }
                </select>
              </label>
            </div>

            @if (setupStructure === 'swiss') {
              <label class="form-control w-full max-w-xs">
                <span class="label-text text-sm">{{ 'tournament.setup.swissRounds' | translate }}</span>
                <input
                  class="input input-bordered input-sm"
                  type="number"
                  min="1"
                  max="15"
                  [(ngModel)]="setupSwissRounds"
                />
                <span class="label-text-alt text-xs opacity-70">
                  {{ 'tournament.setup.swissSuggested' | translate: { n: '' + suggestedSwiss() } }}
                </span>
              </label>
            }

            <div>
              <span class="label-text text-sm block mb-2">{{ 'tournament.setup.players' | translate }}</span>
              <textarea
                class="textarea textarea-bordered w-full text-sm min-h-32 font-mono"
                [(ngModel)]="setupPlayersText"
                [placeholder]="'tournament.setup.playersPlaceholder' | translate"
              ></textarea>
              <p class="text-xs text-base-content/60 mt-1">
                {{ 'tournament.setup.playersHint' | translate: { count: '' + parsedPlayerCount() } }}
              </p>
            </div>

            @if (setupError()) {
              <div class="alert alert-warning text-sm py-2">{{ setupError()! | translate }}</div>
            }

            <button type="button" class="btn btn-primary btn-sm" (click)="startTournament()">
              {{ 'tournament.setup.start' | translate }}
            </button>
          </div>
        </app-duel-panel>
      } @else {
        @let t = store.active()!;

        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-lg font-semibold truncate">{{ t.name }}</h2>
          <span class="badge badge-outline badge-sm">{{ structureLabel(t.structure) | translate }}</span>
          <span class="badge badge-ghost badge-sm">{{ scoringLabel(t.scoring) | translate }}</span>
          @if (store.isComplete()) {
            <span class="badge badge-success badge-sm">{{ 'tournament.status.completed' | translate }}</span>
          } @else {
            <span class="badge badge-info badge-sm">
              {{ 'tournament.status.round' | translate: { n: '' + (store.currentRound()?.number ?? 0) } }}
            </span>
          }
        </div>

        <div role="tablist" class="tabs tabs-box tabs-sm bg-base-200/80 p-0.5 rounded-lg w-fit">
          <button
            type="button"
            role="tab"
            class="tab text-sm px-3"
            [class.tab-active]="activeTab() === 'matches'"
            (click)="activeTab.set('matches')"
          >
            {{ 'tournament.tab.matches' | translate }}
          </button>
          <button
            type="button"
            role="tab"
            class="tab text-sm px-3"
            [class.tab-active]="activeTab() === 'standings'"
            (click)="activeTab.set('standings')"
          >
            {{ 'tournament.tab.standings' | translate }}
          </button>
          @if (t.structure === 'single-elim' || t.structure === 'double-elim') {
            <button
              type="button"
              role="tab"
              class="tab text-sm px-3"
              [class.tab-active]="activeTab() === 'bracket'"
              (click)="activeTab.set('bracket')"
            >
              {{ 'tournament.tab.bracket' | translate }}
            </button>
          }
        </div>

        @switch (activeTab()) {
          @case ('matches') {
            <app-duel-panel [title]="'tournament.matches.title' | translate">
              @if (store.currentRound(); as round) {
                <div class="space-y-3">
                  @for (match of round.matches; track match.id) {
                    <div
                      class="rounded-lg border border-base-300/60 bg-base-200/30 p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                      [class.opacity-60]="!match.player1Id || (!match.player2Id && !match.isBye)"
                    >
                      <div class="flex items-center gap-2 min-w-0 flex-1">
                        <span class="badge badge-ghost badge-sm shrink-0">T{{ match.table }}</span>
                        @if (match.isBye) {
                          <span class="text-sm">
                            {{ store.playerName(match.player1Id) }}
                            <span class="badge badge-warning badge-xs ml-1">{{ 'tournament.bye' | translate }}</span>
                          </span>
                        } @else {
                          <span class="text-sm truncate">
                            {{ store.playerName(match.player1Id) }}
                            <span class="text-base-content/50 mx-1">vs</span>
                            {{ store.playerName(match.player2Id) }}
                          </span>
                        }
                      </div>

                      @if (!match.isBye && match.player1Id && match.player2Id) {
                        <div class="flex flex-wrap gap-1 shrink-0">
                          <button
                            type="button"
                            class="btn btn-xs"
                            [class.btn-success]="match.result === 'player1'"
                            [class.btn-outline]="match.result !== 'player1'"
                            (click)="setResult(match.id, 'player1')"
                          >
                            {{ store.playerName(match.player1Id) }}
                          </button>
                          @if (t.scoring !== 'match-wins') {
                            <button
                              type="button"
                              class="btn btn-xs"
                              [class.btn-warning]="match.result === 'draw'"
                              [class.btn-outline]="match.result !== 'draw'"
                              (click)="setResult(match.id, 'draw')"
                            >
                              {{ 'tournament.result.draw' | translate }}
                            </button>
                          }
                          <button
                            type="button"
                            class="btn btn-xs"
                            [class.btn-success]="match.result === 'player2'"
                            [class.btn-outline]="match.result !== 'player2'"
                            (click)="setResult(match.id, 'player2')"
                          >
                            {{ store.playerName(match.player2Id) }}
                          </button>
                          @if (match.result !== 'pending') {
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              (click)="setResult(match.id, 'pending')"
                            >
                              {{ 'tournament.result.clear' | translate }}
                            </button>
                          }
                        </div>
                      } @else if (match.isBye) {
                        <span class="badge badge-success badge-sm">{{ 'tournament.result.byeWin' | translate }}</span>
                      } @else {
                        <span class="text-xs text-base-content/50">{{ 'tournament.match.tbd' | translate }}</span>
                      }
                    </div>
                  }
                </div>

                <div class="mt-4 flex flex-wrap gap-2 items-center">
                  @if (store.canAdvance() && !store.isComplete()) {
                    <button type="button" class="btn btn-primary btn-sm" (click)="advanceRound()">
                      {{ 'tournament.advanceRound' | translate }}
                    </button>
                  } @else if (store.isComplete()) {
                    <span class="text-sm text-success">{{ 'tournament.allDone' | translate }}</span>
                  } @else {
                    <span class="text-sm text-base-content/60">{{ 'tournament.pendingResults' | translate }}</span>
                  }
                </div>
              } @else {
                <app-empty-state titleKey="tournament.noRound" />
              }
            </app-duel-panel>
          }

          @case ('standings') {
            <app-duel-panel [title]="'tournament.standings.title' | translate">
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{{ 'tournament.standings.player' | translate }}</th>
                      <th>{{ 'tournament.standings.points' | translate }}</th>
                      <th>W</th>
                      <th>L</th>
                      <th>D</th>
                      <th>{{ 'tournament.standings.byes' | translate }}</th>
                      <th>OMW%</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of store.standings(); track row.playerId; let i = $index) {
                      <tr [class.opacity-50]="isDropped(row.playerId)">
                        <td>{{ i + 1 }}</td>
                        <td class="font-medium">{{ store.playerName(row.playerId) }}</td>
                        <td>{{ row.points }}</td>
                        <td>{{ row.matchWins }}</td>
                        <td>{{ row.matchLosses }}</td>
                        <td>{{ row.matchDraws }}</td>
                        <td>{{ row.byes }}</td>
                        <td>{{ formatPercent(row.omw) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </app-duel-panel>
          }

          @case ('bracket') {
            <app-duel-panel [title]="'tournament.bracket.title' | translate">
              <div class="space-y-6 overflow-x-auto">
                @for (round of t.rounds; track round.number) {
                  <div>
                    <h3 class="text-sm font-semibold mb-2 text-base-content/70">
                      {{ 'tournament.bracket.round' | translate: { n: '' + round.number } }}
                    </h3>
                    <div class="flex flex-wrap gap-2">
                      @for (match of round.matches; track match.id) {
                        <div
                          class="rounded border border-base-300/60 px-3 py-2 text-xs min-w-[10rem] bg-base-200/20"
                          [class.ring-2]="match.result !== 'pending' && !match.isBye"
                          [class.ring-success/40]="match.result !== 'pending'"
                        >
                          @if (match.isBye) {
                            <div>{{ store.playerName(match.player1Id) }} ({{ 'tournament.bye' | translate }})</div>
                          } @else {
                            <div [class.font-bold]="match.result === 'player1'">
                              {{ store.playerName(match.player1Id) }}
                            </div>
                            <div class="text-base-content/40 text-center">vs</div>
                            <div [class.font-bold]="match.result === 'player2'">
                              {{ store.playerName(match.player2Id) }}
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            </app-duel-panel>
          }
        }
      }
    </main>
  `,
})
export class TournamentPage {
  protected readonly store = inject(TournamentStore);

  setupName = '';
  setupStructure: TournamentStructure = 'swiss';
  setupScoring: ScoringSystem = '3-1-0';
  setupSwissRounds = 4;
  setupPlayersText = '';
  setupError = signal<string | null>(null);
  activeTab = signal<ViewTab>('matches');

  readonly structureOptions: Array<{ value: TournamentStructure; labelKey: string }> = [
    { value: 'swiss', labelKey: 'tournament.structure.swiss' },
    { value: 'single-elim', labelKey: 'tournament.structure.singleElim' },
    { value: 'double-elim', labelKey: 'tournament.structure.doubleElim' },
    { value: 'round-robin', labelKey: 'tournament.structure.roundRobin' },
  ];

  readonly scoringOptions: Array<{ value: ScoringSystem; labelKey: string }> = [
    { value: '3-1-0', labelKey: 'tournament.scoring.310' },
    { value: '2-1-0', labelKey: 'tournament.scoring.210' },
    { value: 'match-wins', labelKey: 'tournament.scoring.matchWins' },
  ];

  readonly parsedPlayerCount = computed(() => this.parsePlayers(this.setupPlayersText).length);

  suggestedSwiss(): number {
    return this.store.suggestedSwissRounds(Math.max(2, this.parsedPlayerCount()));
  }

  structureLabel(structure: TournamentStructure): string {
    return this.structureOptions.find((o) => o.value === structure)?.labelKey ?? structure;
  }

  scoringLabel(scoring: ScoringSystem): string {
    return this.scoringOptions.find((o) => o.value === scoring)?.labelKey ?? scoring;
  }

  startTournament(): void {
    const names = this.parsePlayers(this.setupPlayersText);
    if (names.length < 2) {
      this.setupError.set('tournament.error.minPlayers');
      return;
    }

    const ok = this.store.startTournament({
      name: this.setupName,
      structure: this.setupStructure,
      scoring: this.setupScoring,
      swissRounds: this.setupStructure === 'swiss' ? this.setupSwissRounds : undefined,
      playerNames: names,
    });

    if (!ok) {
      this.setupError.set('tournament.error.minPlayers');
      return;
    }

    this.setupError.set(null);
    this.activeTab.set('matches');
  }

  resetTournament(): void {
    this.store.reset();
    this.setupError.set(null);
  }

  setResult(matchId: string, result: MatchResult): void {
    this.store.setMatchResult(matchId, result);
  }

  advanceRound(): void {
    this.store.advanceRound();
  }

  isDropped(playerId: string): boolean {
    return this.store.active()?.players.find((p) => p.id === playerId)?.dropped ?? false;
  }

  formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  private parsePlayers(text: string): string[] {
    return text
      .split(/[\n,;]+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
}
