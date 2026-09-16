import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { FlowLibraryService } from '../../ygo-flow/services/flow-library.service';
import { I18nService } from '../../../services/i18n.service';
import { buildReplayFlow, replayFlowTurns } from '../utils/replay-flow';
import { PasscodeCatalogService } from '../../../services/passcode-catalog.service';
import { GeminiCoachService } from '../../../services/gemini-coach.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { DuelPanelComponent } from '../../../shared/ui/duel-panel/duel-panel.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { ReplaySlot } from '../../../models/replay.model';
import { ReplayStore } from '../stores/replay.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-replay-page',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    PageHeaderComponent,
    DuelPanelComponent,
    EmptyStateComponent,
  ],
  providers: [ReplayStore],
  template: `
    <main class="page-main page-stack max-w-3xl lg:max-w-4xl fade-in-panel">
      <app-page-header titleKey="replay.title" subtitleKey="replay.subtitle" />

      <app-duel-panel>
        <div class="p-4 sm:p-5 space-y-4">
          <p class="text-sm text-base-content/70">{{ 'replay.intro' | translate }}</p>

          <label class="form-control">
            <span>{{ 'replay.flow.deck' | translate }}</span>
            <select class="select w-full" [ngModel]="store.selectedDeck()?.id ?? ''" (ngModelChange)="selectReplayDeck($event)" [disabled]="store.busy()">
              <option value="">{{ 'replay.flow.embeddedDeck' | translate }}</option>
              @for (deck of decks.decklists(); track deck.id) { <option [value]="deck.id">{{ deck.name }}</option> }
            </select>
          </label>
          <p class="text-xs text-base-content/65">{{ 'replay.flow.deckHint' | translate }}</p>
          <div class="space-y-3">
            @for (slot of visibleSlots(); track slot.id) {
              <label class="form-control w-full">
                <div class="label py-1">
                  <span class="label-text font-medium">{{ slotLabel(slot.id) | translate }}</span>
                </div>
                <input
                  type="file"
                  accept=".yrp3d,application/octet-stream"
                  class="file-input file-input-bordered file-input-sm w-full"
                  [disabled]="store.busy()"
                  (change)="onFile(slot.id, $event)"
                />
                @if (slot.file; as file) {
                  <div class="label py-1">
                    <span class="label-text-alt text-base-content/60 truncate">{{ file.name }}</span>
                  </div>
                }
                @if (slot.errorKey; as err) {
                  <div class="label py-1">
                    <span class="label-text-alt text-error">{{ err | translate }}</span>
                  </div>
                }
              </label>
            }
          </div>

          <label class="label cursor-pointer justify-start gap-3 py-1">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              [ngModel]="store.deckAdviceEnabled()"
              (ngModelChange)="store.setDeckAdviceEnabled($event)"
              [disabled]="store.busy()"
            />
            <span class="label-text">
              <span class="font-medium">{{ 'replay.deckAdviceToggle' | translate }}</span>
              <span class="block text-xs text-base-content/60">{{ 'replay.deckAdviceHint' | translate }}</span>
            </span>
          </label>

          <label class="label cursor-pointer justify-start gap-3 py-1">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              [ngModel]="store.geminiEnabled()"
              (ngModelChange)="store.setGeminiEnabled($event)"
              [disabled]="store.busy()"
            />
            <span class="label-text">
              <span class="font-medium">{{ 'replay.gemini.toggle' | translate }}</span>
              <span class="block text-xs text-base-content/60">{{ 'replay.gemini.toggleHint' | translate }}</span>
            </span>
          </label>

          @if (store.geminiEnabled()) {
            <div class="rounded-lg border border-base-300/60 bg-base-200/30 p-3 space-y-3">
              <p class="text-xs text-base-content/65">{{ 'replay.gemini.privacy' | translate }}</p>
              <p class="text-xs text-base-content/55">{{ 'replay.gemini.apiKeyHint' | translate }}</p>

              <label class="form-control">
                <span class="label-text text-xs">{{ 'replay.gemini.model' | translate }}</span>
                <select
                  class="select select-bordered select-sm"
                  [ngModel]="gemini.selectedModel()"
                  (ngModelChange)="gemini.setModel($event)"
                >
                  @for (m of gemini.modelOptions; track m) {
                    <option [value]="m">{{ m }}</option>
                  }
                </select>
              </label>

              @if (!gemini.unlocked()) {
                @if (!gemini.hasStoredKey()) {
                  <label class="form-control">
                    <span class="label-text text-xs">{{ 'replay.gemini.apiKey' | translate }}</span>
                    <input
                      type="password"
                      class="input input-bordered input-sm"
                      [(ngModel)]="apiKeyDraft"
                      autocomplete="off"
                    />
                  </label>
                }
                <label class="form-control">
                  <span class="label-text text-xs">{{ 'replay.gemini.passphrase' | translate }}</span>
                  <input
                    type="password"
                    class="input input-bordered input-sm"
                    [(ngModel)]="passphraseDraft"
                    autocomplete="off"
                  />
                </label>
                <div class="flex flex-wrap gap-2">
                  @if (!gemini.hasStoredKey()) {
                    <button type="button" class="btn btn-outline btn-sm" (click)="saveGeminiKey()">
                      {{ 'replay.gemini.save' | translate }}
                    </button>
                  } @else {
                    <button type="button" class="btn btn-outline btn-sm" (click)="unlockGemini()">
                      {{ 'replay.gemini.unlock' | translate }}
                    </button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="gemini.clearStored()">
                      {{ 'replay.gemini.clear' | translate }}
                    </button>
                  }
                </div>
                @if (geminiLocalError(); as gErr) {
                  <p class="text-xs text-error">{{ gErr | translate }}</p>
                }
              } @else {
                <div class="flex flex-wrap items-center gap-2">
                  <span class="badge badge-success badge-sm">{{ 'replay.gemini.unlocked' | translate }}</span>
                  <button type="button" class="btn btn-ghost btn-xs" (click)="gemini.lockSession()">
                    {{ 'replay.gemini.lock' | translate }}
                  </button>
                </div>
              }
            </div>
          }

          @if (store.formErrorKey(); as formErr) {
            <div class="alert alert-warning alert-sm py-2" role="alert">
              <span>{{ formErr | translate }}</span>
            </div>
          }

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-primary btn-sm gap-2"
              [disabled]="!store.canAnalyze() || store.busy()"
              (click)="store.analyze()"
            >
              @if (store.busy()) {
                <span class="loading loading-spinner loading-xs"></span>
              }
              {{ 'replay.analyze' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              [disabled]="store.busy()"
              (click)="store.reset()"
            >
              {{ 'replay.reset' | translate }}
            </button>
          </div>
        </div>
      </app-duel-panel>

      @if (!store.primaryAnalysis() && !store.busy()) {
        <app-empty-state
          titleKey="replay.emptyTitle"
          hintKey="replay.emptyHint"
          hostClass="py-8"
        />
      }

      @if (store.primaryAnalysis(); as primary) {
        <app-duel-panel>
          <div class="p-4 sm:p-5 space-y-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0 space-y-1">
                <p class="duel-eyebrow">{{ 'replay.result.summary' | translate }}</p>
                <h2 class="text-lg font-bold leading-tight truncate">{{ primary.replay.fileName }}</h2>
                <p class="text-sm text-base-content/70">
                  {{ primary.replay.focusName }}
                  <span class="opacity-50">vs</span>
                  {{ primary.replay.opponentName }}
                </p>
              </div>
              @if (primary.replay.focusWon === true) {
                <span class="badge badge-success badge-sm">{{ 'replay.result.win' | translate }}</span>
              } @else if (primary.replay.focusWon === false) {
                <span class="badge badge-error badge-sm">{{ 'replay.result.loss' | translate }}</span>
              } @else {
                <span class="badge badge-ghost badge-sm">{{ 'replay.result.unknown' | translate }}</span>
              }
            </div>

            <dl class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <dt class="text-xs text-base-content/50">{{ 'replay.stats.turns' | translate }}</dt>
                <dd class="font-semibold">{{ primary.replay.turnCount }}</dd>
              </div>
              <div>
                <dt class="text-xs text-base-content/50">{{ 'replay.stats.summons' | translate }}</dt>
                <dd class="font-semibold">{{ primary.stats.summons + primary.stats.spSummons }}</dd>
              </div>
              <div>
                <dt class="text-xs text-base-content/50">{{ 'replay.stats.chains' | translate }}</dt>
                <dd class="font-semibold">{{ primary.stats.chains }}</dd>
              </div>
              <div>
                <dt class="text-xs text-base-content/50">{{ 'replay.stats.missed' | translate }}</dt>
                <dd class="font-semibold">{{ primary.stats.missedEffects }}</dd>
              </div>
            </dl>

            @if (primary.restrictionTrace?.focusLocksSeen?.length) {
              <div class="space-y-1">
                <h3 class="text-sm font-semibold">{{ 'replay.locksTitle' | translate }}</h3>
                <ul class="text-xs space-y-1 text-base-content/75">
                  @for (lock of primary.restrictionTrace!.focusLocksSeen; track lock.sourceCode + lock.appliedTurn) {
                    <li>
                      T{{ lock.appliedTurn }} · {{ lock.sourceName }} → {{ lock.kind }}
                      @if (lock.note) {
                        <span class="opacity-70"> — {{ lock.note }}</span>
                      }
                    </li>
                  }
                </ul>
              </div>
            }

            @if (primary.restrictionTrace?.annotations?.length) {
              <div class="space-y-1">
                <h3 class="text-sm font-semibold">{{ 'replay.legalNotesTitle' | translate }}</h3>
                <ul class="text-xs space-y-1 text-base-content/70">
                  @for (a of primary.restrictionTrace!.annotations; track $index) {
                    @if (a.kind === 'engine_flag_explained' || a.kind === 'lock_applied') {
                      <li>{{ a.message }}</li>
                    }
                  }
                </ul>
              </div>
            }

            @if (!primary.replay.hasEmbeddedYrp) {
              <p class="text-xs text-warning">{{ 'replay.noDeckWarning' | translate }}</p>
            }

            <div class="space-y-2">
              <h3 class="text-sm font-semibold">{{ 'replay.findingsTitle' | translate }}</h3>
              @if (primary.findings.length === 0) {
                <p class="text-sm text-base-content/60">{{ 'replay.noFindings' | translate }}</p>
              } @else {
                <ul class="space-y-2">
                  @for (f of primary.findings; track $index) {
                    <li class="rounded-lg border border-base-300/60 bg-base-200/40 px-3 py-2">
                      <div class="flex items-start gap-2">
                        <span
                          class="badge badge-sm mt-0.5"
                          [class.badge-info]="f.severity === 'info'"
                          [class.badge-warning]="f.severity === 'warn'"
                          [class.badge-error]="f.severity === 'critical'"
                        >
                          {{ f.severity }}
                        </span>
                        <div class="min-w-0 space-y-0.5">
                          <p class="text-sm font-medium">{{ f.titleKey | translate }}</p>
                          <p class="text-xs text-base-content/65">
                            {{ f.detailKey | translate: findingParams(f) }}
                          </p>
                          @if (f.code; as code) {
                            <p class="text-xs font-medium text-primary">{{ cardName(code) }}</p>
                          }
                        </div>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        </app-duel-panel>
      }

      <app-duel-panel>
        <div class="p-4 sm:p-5 space-y-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <h2 class="text-lg font-bold">{{ 'replay.lines.title' | translate }}</h2>
            <div class="flex items-center gap-2">
              <span class="text-xs text-base-content/60">
                {{ 'replay.lines.memory' | translate: { count: '' + store.observedLines().length } }}
              </span>
              <button type="button" class="btn btn-ghost btn-xs" (click)="store.clearLearning()">
                {{ 'replay.lines.clear' | translate }}
              </button>
            </div>
          </div>

          @if (turns().length) {
            <div class="space-y-2">
              <span class="label-text text-xs">{{ 'replay.flow.turn' | translate }}</span>
              <div class="flex flex-wrap gap-1.5">
                @for (turn of turns(); track turn) {
                  <button
                    type="button"
                    class="btn btn-xs"
                    [class.btn-primary]="isTurnSelected(turn)"
                    [class.btn-outline]="!isTurnSelected(turn)"
                    (click)="toggleTurn(turn)"
                  >
                    T{{ turn }}
                  </button>
                }
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="btn btn-primary btn-sm gap-2" (click)="createReplayFlows()">
                {{ 'replay.flow.create' | translate }}
                @if (selectedTurns().size > 1) {
                  <span class="badge badge-sm badge-neutral">{{ selectedTurns().size }}</span>
                }
              </button>
              <p class="text-xs text-base-content/65">{{ 'replay.flow.observed' | translate }}</p>
            </div>
          }

          @if (flowError(); as error) {
            <p class="text-xs text-error" role="status">{{ error | translate }}</p>
          }

          @if (store.primaryAnalysis(); as analysis) {
            <div class="space-y-2">
              @for (comparison of analysis.lineComparisons ?? []; track $index) {
                <div class="rounded-lg border border-base-300/60 bg-base-200/40 px-3 py-2 space-y-2">
                  <div class="flex items-start gap-2">
                    <span
                      class="badge badge-sm mt-0.5"
                      [class.badge-success]="comparison.status === 'matched'"
                      [class.badge-warning]="comparison.status === 'deviation'"
                      [class.badge-ghost]="comparison.status === 'inconclusive'"
                    >
                      {{ ('replay.lines.' + comparison.status) | translate }}
                    </span>
                    <p class="text-xs text-base-content/65">{{ ('replay.lines.' + comparison.reason) | translate }}</p>
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2 sm:divide-x sm:divide-base-300/50">
                    <div class="space-y-1.5 sm:pr-4">
                      <h4 class="text-xs font-semibold text-base-content/70">{{ 'replay.lines.played' | translate }}</h4>
                      <ol class="list-decimal pl-5 text-sm space-y-1">
                        @for (action of comparison.played; track $index) {
                          <li>{{ ('flow.wizard.observed.' + action.kind) | translate: { name: cardName(action.cardId) } }}</li>
                        }
                      </ol>
                    </div>
                    <div class="space-y-1.5 sm:pl-4">
                      <h4 class="text-xs font-semibold text-base-content/70">{{ 'replay.lines.recommended' | translate }}</h4>
                      <ol class="list-decimal pl-5 text-sm space-y-1">
                        @for (action of comparison.recommended; track $index) {
                          <li>{{ ('flow.wizard.observed.' + action.kind) | translate: { name: cardName(action.cardId) } }}</li>
                        }
                      </ol>
                    </div>
                  </div>
                </div>
              } @empty {
                <p class="text-sm text-base-content/60">{{ 'replay.lines.noOpening' | translate }}</p>
              }
            </div>
          }
        </div>
      </app-duel-panel>

      @if (store.geminiEnabled() && store.coachBrief()) {
        <app-duel-panel>
          <div class="p-4 sm:p-5 space-y-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="duel-eyebrow">Gemini</p>
                <h2 class="text-lg font-bold">{{ 'replay.gemini.coachTitle' | translate }}</h2>
                <p class="text-sm text-base-content/65">{{ 'replay.gemini.coachHint' | translate }}</p>
              </div>
              <button
                type="button"
                class="btn btn-primary btn-sm gap-2"
                [disabled]="store.coachBusy() || !gemini.unlocked()"
                (click)="store.runCoach()"
              >
                @if (store.coachBusy()) {
                  <span class="loading loading-spinner loading-xs"></span>
                }
                {{ 'replay.gemini.run' | translate }}
              </button>
            </div>
            @if (store.coachErrorKey(); as cErr) {
              <p class="text-xs text-error">{{ cErr | translate }}</p>
            }
            @if (gemini.lastErrorDetail(); as detail) {
              <p class="text-xs text-base-content/55 break-words">{{ detail }}</p>
            }
            @if (gemini.lastUsedModel(); as used) {
              <p class="text-xs text-base-content/50">{{ 'replay.gemini.usedModel' | translate: { model: used } }}</p>
            }
            @if (store.coachText(); as text) {
              <div class="prose prose-sm max-w-none whitespace-pre-wrap text-sm">{{ text }}</div>
            }
          </div>
        </app-duel-panel>
      }

      @if (store.deckAdvice(); as advice) {
        <app-duel-panel>
          <div class="p-4 sm:p-5 space-y-3">
            <div>
              <p class="duel-eyebrow">{{ 'replay.deckAdvice.eyebrow' | translate }}</p>
              <h2 class="text-lg font-bold">{{ 'replay.deckAdvice.title' | translate }}</h2>
              <p class="text-sm text-base-content/65">
                {{ 'replay.deckAdvice.subtitle' | translate: { count: '' + advice.replaysUsed } }}
              </p>
            </div>
            @if (advice.items.length === 0) {
              <p class="text-sm text-base-content/60">{{ 'replay.deckAdvice.empty' | translate }}</p>
            } @else {
              <ul class="space-y-2">
                @for (item of advice.items; track item.code + item.reasonKey) {
                  <li class="flex items-center gap-3 rounded-lg border border-base-300/60 px-3 py-2">
                    <img
                      [src]="'https://images.ygoprodeck.com/images/cards_small/' + item.code + '.jpg'"
                      [alt]="''"
                      class="w-10 rounded"
                      loading="lazy"
                    />
                    <div class="min-w-0">
                      <p class="text-sm font-medium truncate">{{ cardName(item.code) }}</p>
                      <p class="text-xs text-base-content/60">
                        {{ item.reasonKey | translate: { hits: '' + item.replayHits } }}
                      </p>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        </app-duel-panel>
      }

      @if (store.analyses().length > 1) {
        <app-duel-panel>
          <div class="p-4 sm:p-5 space-y-2">
            <h3 class="text-sm font-semibold">{{ 'replay.extraResults' | translate }}</h3>
            <ul class="space-y-2 text-sm">
              @for (a of store.analyses().slice(1); track a.replay.sha256) {
                <li class="flex flex-wrap items-center justify-between gap-2 border-b border-base-300/40 py-2 last:border-0">
                  <span class="truncate">{{ a.replay.fileName }}</span>
                  <span class="text-xs text-base-content/60">
                    {{ a.replay.turnCount }} {{ 'replay.stats.turns' | translate }} ·
                    {{ a.findings.length }} {{ 'replay.findingsCount' | translate }}
                  </span>
                </li>
              }
            </ul>
          </div>
        </app-duel-panel>
      }

      @if (store.historyEntries().length) {
        <app-duel-panel>
          <div class="p-4 sm:p-5 space-y-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="duel-eyebrow">{{ 'replay.history.eyebrow' | translate }}</p>
                <h2 class="text-lg font-bold">{{ 'replay.history.title' | translate }}</h2>
              </div>
              <span class="text-xs text-base-content/60">
                {{ 'replay.history.count' | translate: { count: '' + store.historyEntries().length } }}
              </span>
            </div>
            <p class="text-xs text-base-content/60">{{ 'replay.history.hint' | translate }}</p>

            <ul class="space-y-2">
              @for (entry of historyEntriesDesc(); track entry.sha256) {
                <li class="rounded-lg border border-base-300/60 bg-base-200/30 overflow-hidden">
                  <details>
                    <summary class="cursor-pointer list-none px-3 py-2 flex flex-wrap items-center justify-between gap-2 select-none">
                      <span class="min-w-0 truncate text-sm font-medium">{{ entry.fileName }}</span>
                      <span class="flex items-center gap-2 text-xs text-base-content/60 shrink-0">
                        <span class="truncate max-w-[10rem]">{{ entry.focusName }} <span class="opacity-50">vs</span> {{ entry.opponentName }}</span>
                        @if (entry.focusWon === true) {
                          <span class="badge badge-success badge-xs">{{ 'replay.result.win' | translate }}</span>
                        } @else if (entry.focusWon === false) {
                          <span class="badge badge-error badge-xs">{{ 'replay.result.loss' | translate }}</span>
                        } @else {
                          <span class="badge badge-ghost badge-xs">{{ 'replay.result.unknown' | translate }}</span>
                        }
                      </span>
                    </summary>
                    <div class="px-3 pb-3 pt-1 space-y-3 border-t border-base-300/40">
                      <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-2">
                        <div>
                          <dt class="text-xs text-base-content/50">{{ 'replay.stats.turns' | translate }}</dt>
                          <dd class="font-semibold">{{ entry.turnCount }}</dd>
                        </div>
                        <div>
                          <dt class="text-xs text-base-content/50">{{ 'replay.stats.summons' | translate }}</dt>
                          <dd class="font-semibold">{{ entry.stats.summons + entry.stats.spSummons }}</dd>
                        </div>
                        <div>
                          <dt class="text-xs text-base-content/50">{{ 'replay.stats.chains' | translate }}</dt>
                          <dd class="font-semibold">{{ entry.stats.chains }}</dd>
                        </div>
                        <div>
                          <dt class="text-xs text-base-content/50">{{ 'replay.stats.missed' | translate }}</dt>
                          <dd class="font-semibold">{{ entry.stats.missedEffects }}</dd>
                        </div>
                      </dl>

                      @if (entry.findings.length) {
                        <ul class="space-y-2">
                          @for (f of entry.findings; track $index) {
                            <li class="rounded-lg border border-base-300/60 bg-base-100/60 px-3 py-2">
                              <div class="flex items-start gap-2">
                                <span
                                  class="badge badge-sm mt-0.5"
                                  [class.badge-info]="f.severity === 'info'"
                                  [class.badge-warning]="f.severity === 'warn'"
                                  [class.badge-error]="f.severity === 'critical'"
                                >
                                  {{ f.severity }}
                                </span>
                                <div class="min-w-0 space-y-0.5">
                                  <p class="text-sm font-medium">{{ f.titleKey | translate }}</p>
                                  <p class="text-xs text-base-content/65">{{ f.detailKey | translate: findingParams(f) }}</p>
                                  @if (f.code; as code) {
                                    <p class="text-xs font-medium text-primary">{{ cardName(code) }}</p>
                                  }
                                </div>
                              </div>
                            </li>
                          }
                        </ul>
                      } @else {
                        <p class="text-sm text-base-content/60">{{ 'replay.noFindings' | translate }}</p>
                      }

                      @for (comparison of entry.lineComparisons; track $index) {
                        <div class="rounded-lg border border-base-300/60 bg-base-100/60 px-3 py-2 space-y-2">
                          <div class="flex items-start gap-2">
                            <span
                              class="badge badge-sm mt-0.5"
                              [class.badge-success]="comparison.status === 'matched'"
                              [class.badge-warning]="comparison.status === 'deviation'"
                              [class.badge-ghost]="comparison.status === 'inconclusive'"
                            >
                              {{ ('replay.lines.' + comparison.status) | translate }}
                            </span>
                            <p class="text-xs text-base-content/65">{{ ('replay.lines.' + comparison.reason) | translate }}</p>
                          </div>
                          <div class="grid gap-4 sm:grid-cols-2 sm:divide-x sm:divide-base-300/50">
                            <div class="space-y-1.5 sm:pr-4">
                              <h4 class="text-xs font-semibold text-base-content/70">{{ 'replay.lines.played' | translate }}</h4>
                              <ol class="list-decimal pl-5 text-sm space-y-1">
                                @for (action of comparison.played; track $index) {
                                  <li>{{ ('flow.wizard.observed.' + action.kind) | translate: { name: cardName(action.cardId) } }}</li>
                                }
                              </ol>
                            </div>
                            <div class="space-y-1.5 sm:pl-4">
                              <h4 class="text-xs font-semibold text-base-content/70">{{ 'replay.lines.recommended' | translate }}</h4>
                              <ol class="list-decimal pl-5 text-sm space-y-1">
                                @for (action of comparison.recommended; track $index) {
                                  <li>{{ ('flow.wizard.observed.' + action.kind) | translate: { name: cardName(action.cardId) } }}</li>
                                }
                              </ol>
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  </details>
                </li>
              }
            </ul>
          </div>
        </app-duel-panel>
      }
    </main>
  `,
})
export class ReplayPage {
  readonly decks = inject(DecklistStore);
  private readonly flowLibrary = inject(FlowLibraryService);
  private readonly router = inject(Router);
  private readonly translations = inject(I18nService);
  readonly selectedTurns = signal<Set<number>>(new Set());
  readonly flowError = signal<string | null>(null);
  turns(): number[] { const r=this.store.primaryAnalysis()?.replay; return r ? replayFlowTurns(r) : []; }
  historyEntriesDesc() { return [...this.store.historyEntries()].reverse(); }
  isTurnSelected(turn: number): boolean { return this.selectedTurns().has(turn); }
  toggleTurn(turn: number): void {
    this.selectedTurns.update((set) => {
      const next = new Set(set);
      if (next.has(turn)) next.delete(turn); else next.add(turn);
      return next;
    });
  }
  selectReplayDeck(id: string): void { this.store.setDeck(this.decks.decklists().find(d=>d.id===id) ?? null); this.flowError.set(null); }
  createReplayFlows(): void {
    this.flowError.set(null);
    const replay = this.store.primaryAnalysis()?.replay;
    if (!replay) return;
    const available = this.turns();
    const picked = [...this.selectedTurns()].filter((t) => available.includes(t));
    const targets = picked.length ? picked : available.slice(0, 1);
    if (!targets.length) { this.flowError.set('replay.flow.unavailable'); return; }
    const createdIds: string[] = [];
    for (const turn of targets) {
      const doc = buildReplayFlow(replay, turn, this.store.selectedDeck(), (id) => this.catalog.toStubCard(id, this.translations.lang())!,
        (kind) => this.translations.t(`replay.flow.action.${kind}`), 'unknown');
      if (!doc?.id) continue;
      if (!this.flowLibrary.save(doc)) { this.flowError.set('replay.flow.saveFailed'); return; }
      createdIds.push(doc.id);
    }
    if (!createdIds.length) { this.flowError.set('replay.flow.unavailable'); return; }
    if (createdIds.length === 1) {
      void this.router.navigate(['/flow'], { queryParams: { flowId: createdIds[0], section: 'canvas' } });
    } else {
      const label = this.store.selectedDeck()?.name ?? replay.focusName;
      void this.router.navigate(['/flow'], { queryParams: { section: 'library', libraryQuery: label } });
    }
  }

  protected readonly store = inject(ReplayStore);
  protected readonly gemini = inject(GeminiCoachService);
  private readonly catalog = inject(PasscodeCatalogService);

  apiKeyDraft = '';
  passphraseDraft = '';
  readonly geminiLocalError = signal<string | null>(null);

  constructor() {
    void this.catalog.ensureLoaded$().subscribe();
  }

  visibleSlots(): ReplaySlot[] {
    const slots = this.store.slots();
    return this.store.deckAdviceEnabled() ? slots : slots.filter((s) => s.id === 'primary');
  }

  slotLabel(id: ReplaySlot['id']): string {
    switch (id) {
      case 'primary':
        return 'replay.slot.primary';
      case 'extra1':
        return 'replay.slot.extra1';
      case 'extra2':
        return 'replay.slot.extra2';
    }
  }

  onFile(slotId: ReplaySlot['id'], event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.store.setFile(slotId, file);
    input.value = '';
  }

  cardName(code: number): string {
    return this.catalog.get(code)?.n ?? `#${code}`;
  }

  findingParams(f: {
    code?: number;
    count?: number;
    meta?: Record<string, string | number>;
  }): Record<string, string> {
    return {
      code: String(f.code ?? 0),
      turn: String(f.meta?.['turn'] ?? 0),
      games: String(f.meta?.['games'] ?? 0),
      count: String(f.count ?? f.meta?.['count'] ?? 1),
      turns: String(f.meta?.['turns'] ?? 0),
      copies: String(f.meta?.['copies'] ?? 1),
      reason: String(f.meta?.['reason'] ?? ''),
      hits: String(f.meta?.['hits'] ?? f.count ?? 1),
    };
  }

  async saveGeminiKey(): Promise<void> {
    this.geminiLocalError.set(null);
    try {
      await this.gemini.saveEncryptedKey(this.apiKeyDraft, this.passphraseDraft);
      this.apiKeyDraft = '';
      this.passphraseDraft = '';
    } catch (err) {
      this.geminiLocalError.set(
        err instanceof Error && err.message.startsWith('replay.')
          ? err.message
          : 'replay.gemini.error.save',
      );
    }
  }

  async unlockGemini(): Promise<void> {
    this.geminiLocalError.set(null);
    try {
      await this.gemini.unlock(this.passphraseDraft);
      this.passphraseDraft = '';
    } catch (err) {
      this.geminiLocalError.set(
        err instanceof Error && err.message.startsWith('replay.')
          ? err.message
          : 'replay.gemini.error.badPassphrase',
      );
    }
  }
}
