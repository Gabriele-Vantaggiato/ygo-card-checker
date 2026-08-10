import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardRelatedGroup, CardRelatedSuggestion } from '../../models/card-knowledge.model';
import { DeckStrategyStore } from '../../features/decklist/stores/deck-strategy.store';
import { DeckCompletionDirection } from '../../utils/completion-prompt.utils';
import { RELATION_GROUP_KEYS } from '../../utils/knowledge-constants';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';
import { LoadingSkeletonComponent } from '../../shared/ui/loading-skeleton/loading-skeleton.component';

@Component({
  selector: 'app-deck-assist-panel',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DuelPanelComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-duel-panel panelClass="overflow-hidden flex flex-col">
      <div class="duel-panel-header flex flex-wrap items-center justify-between gap-2 normal-case tracking-normal">
        <span>{{ 'decklist.assist.title' | translate }}</span>
        @if (strategy.ragResult().summary; as summary) {
          <span class="badge badge-primary badge-xs font-normal truncate max-w-[55%]">
            {{ summary }}
          </span>
        }
      </div>

      <details class="group border-b border-base-300/60" [open]="strategyOpen()">
        <summary
          class="list-none cursor-pointer px-3 py-2.5 sm:px-4 text-xs font-semibold text-base-content/70 flex items-center justify-between gap-2 select-none [&::-webkit-details-marker]:hidden"
          (click)="$event.preventDefault(); strategyOpen.set(!strategyOpen())"
        >
          <span>{{ 'decklist.assist.strategyToggle' | translate }}</span>
          <span class="text-[10px] uppercase tracking-wide text-base-content/45 group-open:hidden lg:hidden">
            {{ 'decklist.assist.expand' | translate }}
          </span>
        </summary>

        <div class="p-3 sm:p-4 space-y-3 border-t border-base-300/40">
          <p class="text-xs text-base-content/65 leading-relaxed">{{ 'decklist.assist.hint' | translate }}</p>

          <div
            class="grid grid-cols-2 gap-2 lg:grid-cols-4"
            role="radiogroup"
            [attr.aria-label]="'strategy.title' | translate"
          >
            @for (option of directions; track option.id) {
              <label
                class="flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors min-h-11"
                [class.border-primary]="strategy.direction() === option.id"
                [class.bg-primary/10]="strategy.direction() === option.id"
                [class.border-base-300/60]="strategy.direction() !== option.id"
              >
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  name="deckAssistDirection"
                  [checked]="strategy.direction() === option.id"
                  (change)="strategy.setDirection(option.id)"
                />
                <span class="text-xs leading-tight">{{ option.labelKey | translate }}</span>
              </label>
            }
          </div>

          <label class="form-control">
            <span class="label-text text-xs text-base-content/60">{{ 'strategy.prompt' | translate }}</span>
            <textarea
              class="textarea textarea-bordered textarea-sm min-h-12"
              [placeholder]="'strategy.promptPlaceholder' | translate"
              [ngModel]="strategy.prompt()"
              (ngModelChange)="strategy.setPrompt($event)"
            ></textarea>
          </label>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <label class="label cursor-pointer gap-2 py-0 min-h-9">
              <input
                type="checkbox"
                class="checkbox checkbox-xs checkbox-primary"
                [ngModel]="strategy.useOllama()"
                (ngModelChange)="strategy.setUseOllama($event)"
              />
              <span class="label-text">{{ 'decklist.completion.useOllama' | translate }}</span>
            </label>
            @if (strategy.ollamaAvailable() === true) {
              <span class="badge badge-success badge-xs">{{ 'decklist.completion.ollamaOnline' | translate }}</span>
            } @else if (strategy.ollamaAvailable() === false) {
              <span class="badge badge-ghost badge-xs">{{ 'decklist.completion.ollamaOffline' | translate }}</span>
            }
          </div>
        </div>
      </details>

      <div class="px-3 py-2 sm:px-4 border-b border-base-300/50 flex flex-wrap items-center gap-2 text-xs text-base-content/65">
        <span class="font-semibold text-base-content/80">{{ 'decklist.suggestions.title' | translate }}</span>
        @if (formatLabel(); as format) {
          <span class="badge badge-outline badge-primary badge-xs font-normal">{{ format }}</span>
        }
        @if (sourceCount() > 0) {
          <span class="text-[11px]">
            {{ 'decklist.suggestions.subtitle' | translate: { count: '' + sourceCount() } }}
          </span>
        }
      </div>

      <!-- Mobile: page scroll only. Desktop: bounded list so the panel stays usable. -->
      <div class="p-2 sm:p-3 lg:min-h-0 lg:max-h-[min(52vh,30rem)] lg:overflow-y-auto lg:overscroll-y-contain">
        @if (!available()) {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'knowledge.unavailable' | translate }}</p>
        } @else if (loading()) {
          <app-loading-skeleton [rows]="5" rowClass="h-12 w-full" />
        } @else if (rankedSuggestions().length === 0) {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'decklist.suggestions.empty' | translate }}</p>
        } @else {
          <ul class="space-y-1.5">
            @for (item of rankedSuggestions(); track item.cardId) {
              <li>
                <button
                  type="button"
                  class="w-full flex items-center gap-2.5 p-2 rounded-xl border border-base-300/40 bg-base-100/80 hover:border-primary/35 hover:bg-primary/5 text-left transition-colors min-h-14"
                  (click)="cardSelected.emit(item)"
                >
                  <img
                    [src]="item.imageSmall"
                    [alt]=""
                    class="w-9 h-12 object-cover rounded-md shadow-sm shrink-0"
                    loading="lazy"
                  />
                  <div class="flex-1 min-w-0 space-y-0.5">
                    <p class="text-sm font-medium truncate leading-tight">{{ item.name }}</p>
                    <p class="text-[11px] text-base-content/55 truncate">
                      {{ item.reasonKey | translate: item.reasonParams }}
                    </p>
                    <p class="text-[10px] uppercase tracking-wide text-base-content/40 truncate">
                      {{ relationLabel(item.relation) | translate }}
                    </p>
                  </div>
                  <div class="flex flex-col items-end gap-1 shrink-0">
                    <span
                      class="badge badge-sm tabular-nums font-semibold"
                      [class.badge-primary]="item.score >= 70"
                      [class.badge-secondary]="item.score >= 40 && item.score < 70"
                      [class.badge-ghost]="item.score < 40"
                      [attr.title]="'decklist.suggestions.synergyScore' | translate: { pct: '' + item.score }"
                    >
                      {{ item.score }}%
                    </span>
                    <span class="badge badge-outline badge-xs tabular-nums">
                      +{{ item.suggestedQty ?? 1 }}
                    </span>
                  </div>
                </button>
              </li>
            }
          </ul>
        }
      </div>
    </app-duel-panel>
  `,
})
export class DeckAssistPanelComponent {
  readonly loading = input(false);
  readonly available = input(true);
  readonly sourceCount = input(0);
  readonly groups = input<CardRelatedGroup[]>([]);
  readonly formatLabel = input<string | null>(null);

  readonly cardSelected = output<CardRelatedSuggestion>();

  protected readonly strategy = inject(DeckStrategyStore);
  protected readonly strategyOpen = signal(
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches,
  );

  protected readonly rankedSuggestions = computed(() =>
    this.groups()
      .flatMap((group) => group.suggestions)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
  );

  readonly directions: Array<{ id: DeckCompletionDirection; labelKey: string }> = [
    { id: 'archetype', labelKey: 'decklist.completion.dir.archetype' },
    { id: 'combo', labelKey: 'decklist.completion.dir.combo' },
    { id: 'staples', labelKey: 'decklist.completion.dir.staples' },
    { id: 'side_meta', labelKey: 'decklist.completion.dir.sideMeta' },
  ];

  protected relationLabel(relation: string): string {
    return RELATION_GROUP_KEYS[relation] ?? 'knowledge.group.other';
  }
}
