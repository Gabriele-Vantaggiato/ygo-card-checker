import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeckBuilderPlan } from '../../features/deck-builder/deck-builder.model';
import { DECK_SECTION_I18N_KEYS, DeckSectionKey } from '../../utils/deck-section.utils';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CardDecisionOptionsComponent } from '../card-decision-options/card-decision-options.component';

@Component({
  selector: 'app-complete-deck-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe, CardDecisionOptionsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <dialog class="modal modal-open" open>
        <div class="modal-box duel-modal w-[calc(100%-2rem)] max-w-2xl max-h-[min(90vh,calc(100dvh-5.5rem))] flex flex-col">
          <h3 class="font-bold text-lg">{{ 'decklist.completion.title' | translate }}</h3>
          <p class="text-sm text-base-content/60 mt-1">{{ 'decklist.completion.hint' | translate }}</p>

          <div class="mt-4 flex flex-wrap items-end gap-3">
            <label class="form-control w-32">
              <span class="label-text text-xs">{{ 'decklist.completion.targetMain' | translate }}</span>
              <input
                type="number"
                class="input input-bordered input-sm"
                min="40"
                max="60"
                [ngModel]="targetMain()"
                (ngModelChange)="targetMainChange.emit($event)"
              />
            </label>
            <label class="label cursor-pointer gap-2 pb-2">
              <input
                type="checkbox"
                class="checkbox checkbox-sm checkbox-primary"
                [ngModel]="includeSide()"
                (ngModelChange)="includeSideChange.emit($event)"
              />
              <span class="label-text text-sm">{{ 'decklist.completion.includeSide' | translate }}</span>
            </label>
            <p class="text-sm text-base-content/70 pb-2">
              {{
                'decklist.completion.progress'
                  | translate: { current: '' + mainCount(), target: '' + targetMain() }
              }}
              ·
              {{
                'decklist.completion.extraProgress'
                  | translate: { current: '' + (plan()?.currentExtra ?? extraCount()), target: '15' }
              }}
              @if (includeSide()) {
                ·
                {{
                  'decklist.completion.sideProgress'
                    | translate: { current: '' + (plan()?.currentSide ?? sideCount()), target: '15' }
                }}
              }
            </p>
          </div>

          <app-card-decision-options (changed)="refresh.emit()" />

          @if (plan()?.poolSource; as src) {
            <div class="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3 min-w-0">
              <p class="text-xs uppercase tracking-wide text-base-content/50">
                {{ 'decklist.completion.poolSource.label' | translate }}
              </p>
              <p class="text-sm font-medium mt-1 break-words">{{ src.deckName }}</p>
              <p class="text-xs text-base-content/60 mt-0.5">
                {{ 'decklist.completion.poolSource.detail' | translate: { coverage: '' + percent(src.coverage), count: '' + src.matchedDecks } }}
                @if (src.deckUrl) {
                  ·
                  <a class="link link-hover" [href]="src.deckUrl" target="_blank" rel="noopener noreferrer">
                    {{ 'decklist.roulette.original' | translate }} ↗
                  </a>
                }
              </p>
            </div>
          }

          @if (plan()?.competitive; as comp) {
            <div class="mt-3 rounded-lg border border-base-300/60 bg-base-200/40 p-3 min-w-0">
              <p class="text-xs uppercase tracking-wide text-base-content/50">
                {{ 'decklist.completion.comp.label' | translate }}
              </p>
              <dl class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt class="text-[11px] text-base-content/50">{{ 'decklist.completion.comp.brick' | translate }}</dt>
                  <dd class="font-medium tabular-nums">
                    {{ percent(comp.brickRate) }}%
                    @if (comp.reference; as ref) {
                      <span class="text-[11px] font-normal text-base-content/50">({{ percent(ref.brickRate) }}%)</span>
                    }
                  </dd>
                </div>
                <div>
                  <dt class="text-[11px] text-base-content/50">{{ 'decklist.completion.comp.synergy' | translate }}</dt>
                  <dd class="font-medium tabular-nums">
                    {{ percent(comp.engineSynergy) }}
                    @if (comp.reference; as ref) {
                      <span class="text-[11px] font-normal text-base-content/50">({{ percent(ref.engineSynergy) }})</span>
                    }
                  </dd>
                </div>
                <div>
                  <dt class="text-[11px] text-base-content/50">{{ 'decklist.completion.comp.consistency' | translate }}</dt>
                  <dd class="font-medium tabular-nums">
                    {{ percent(comp.consistency) }}
                    @if (comp.reference; as ref) {
                      <span class="text-[11px] font-normal text-base-content/50">({{ percent(ref.consistency) }})</span>
                    }
                  </dd>
                </div>
                <div>
                  <dt class="text-[11px] text-base-content/50">{{ 'decklist.completion.comp.usage' | translate }}</dt>
                  <dd class="font-medium tabular-nums">
                    {{ percent(comp.usage) }}%
                    @if (comp.reference; as ref) {
                      <span class="text-[11px] font-normal text-base-content/50">({{ percent(ref.usage) }}%)</span>
                    }
                  </dd>
                </div>
              </dl>
              <p class="text-xs text-base-content/50 mt-2">{{ 'decklist.completion.comp.note' | translate }}</p>
            </div>
          }

          @if (plan()?.handStats; as hand) {
            <div class="mt-3 rounded-lg border border-base-300/60 bg-base-200/40 p-3 min-w-0">
              <p class="text-xs uppercase tracking-wide text-base-content/50">
                {{ 'decklist.completion.hand.label' | translate }}
              </p>
              <p class="text-sm mt-1">
                {{ 'decklist.completion.hand.starter' | translate: { pct: '' + percent(hand.starterOdds), count: '' + hand.starters } }}
                ·
                {{ 'decklist.completion.hand.handTrap' | translate: { pct: '' + percent(hand.handTrapOdds), count: '' + hand.handTraps } }}
              </p>
              <p class="text-xs text-base-content/50 mt-0.5">
                {{ 'decklist.completion.hand.note' | translate: { known: '' + hand.knownCards, total: '' + hand.mainSize } }}
              </p>
            </div>
          }

          @if (plan()?.identity; as identity) {
            <div class="mt-3 rounded-lg border border-base-300/60 bg-base-200/40 p-3">
              <p class="text-xs uppercase tracking-wide text-base-content/50">
                {{ 'decklist.completion.identity.label' | translate }}
              </p>
              @if (identity.hasIdentity && identity.archetypes.length > 0) {
                <p class="text-sm font-medium mt-1">{{ identity.archetypes.join(' / ') }}</p>
              } @else {
                <p class="text-sm text-base-content/60 mt-1">
                  {{ 'decklist.completion.identity.unclear' | translate }}
                </p>
              }
            </div>
          }

          @if (planning()) {
            <p class="text-sm text-base-content/60 mt-4">{{ 'decklist.completion.planning' | translate }}</p>
          } @else if (plan(); as p) {
            @if (p.status === 'already_complete') {
              <p class="text-sm text-success mt-4">{{ 'decklist.completion.alreadyComplete' | translate }}</p>
            } @else if (p.status === 'empty_deck') {
              <p class="text-sm text-warning mt-4">{{ 'decklist.completion.emptyDeck' | translate }}</p>
            } @else if (p.status === 'no_candidates') {
              <p class="text-sm text-warning mt-4">{{ 'decklist.completion.noCandidates' | translate }}</p>
            } @else {
              <div class="mt-4 space-y-4 overflow-y-auto flex-1 min-h-0">
                <div class="space-y-2">
                  <h4 class="text-sm font-semibold flex items-center gap-2">
                    {{ 'decklist.completion.addsTitle' | translate: { count: '' + p.adds.length } }}
                    @if (!p.aiUsed && !p.poolSource) {
                      <span class="badge badge-ghost badge-sm">{{ 'decklist.completion.cooccurrenceOnly' | translate }}</span>
                    }
                  </h4>
                  <ul class="space-y-2">
                    @for (add of p.adds; track add.cardId) {
                      <li class="flex items-center gap-3 p-2 rounded-lg bg-base-200/60">
                        <img [src]="add.imageUrlSmall" [alt]="" class="w-9 h-12 object-cover rounded shrink-0" loading="lazy" />
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium truncate">
                            {{ add.name }}
                            <span class="text-[10px] uppercase text-base-content/50 ml-1">
                              {{ sectionTitleKey(add.section) | translate }}
                            </span>
                          </p>
                          <p class="text-[11px] text-base-content/60 truncate">{{ add.reason }}</p>
                        </div>
                        <span class="badge badge-primary">+{{ add.quantity }}</span>
                      </li>
                    }
                  </ul>
                </div>
              </div>
            }
          }

          <div class="modal-action shrink-0 flex-wrap gap-2 mt-4">
            <button type="button" class="btn btn-ghost" (click)="closed.emit()">
              {{ 'decklist.dialog.cancel' | translate }}
            </button>
            <button type="button" class="btn btn-ghost" [disabled]="planning()" (click)="refresh.emit()">
              {{ 'decklist.completion.refresh' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="planning() || plan()?.status !== 'ready'"
              (click)="apply.emit()"
            >
              {{ 'decklist.completion.apply' | translate }}
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="closed.emit()">close</button>
        </form>
      </dialog>
    }
  `,
})
export class CompleteDeckDialogComponent {
  readonly open = input(false);
  readonly targetMain = input(40);
  readonly includeSide = input(true);
  readonly mainCount = input(0);
  readonly extraCount = input(0);
  readonly sideCount = input(0);
  readonly planning = input(false);
  readonly plan = input<DeckBuilderPlan | null>(null);

  readonly targetMainChange = output<number | string>();
  readonly includeSideChange = output<boolean>();
  readonly closed = output<void>();
  readonly refresh = output<void>();
  readonly apply = output<void>();

  percent(ratio: number): number {
    return Math.round(ratio * 100);
  }

  sectionTitleKey(section: DeckSectionKey | undefined): string {
    return DECK_SECTION_I18N_KEYS[section ?? 'main'].title;
  }
}
