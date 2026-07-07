import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardRelatedGroup, CardRelatedSuggestion } from '../../models/card-knowledge.model';
import { DeckStrategyStore } from '../../features/decklist/stores/deck-strategy.store';
import { DeckCompletionDirection } from '../../utils/completion-prompt.utils';
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

      <div class="p-3 sm:p-4 space-y-4 border-b border-base-300/60">
        <p class="text-xs text-base-content/65 leading-relaxed">{{ 'decklist.assist.hint' | translate }}</p>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2" role="radiogroup" [attr.aria-label]="'strategy.title' | translate">
          @for (option of directions; track option.id) {
            <label
              class="flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors"
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
            class="textarea textarea-bordered textarea-sm min-h-14"
            [placeholder]="'strategy.promptPlaceholder' | translate"
            [ngModel]="strategy.prompt()"
            (ngModelChange)="strategy.setPrompt($event)"
          ></textarea>
        </label>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <label class="label cursor-pointer gap-2 py-0">
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

      <div class="p-3 sm:p-4 min-h-0 max-h-[min(50vh,28rem)] overflow-y-auto overscroll-y-contain">
        @if (!available()) {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'knowledge.unavailable' | translate }}</p>
        } @else if (loading()) {
          <app-loading-skeleton [rows]="4" rowClass="h-10 w-full" />
        } @else if (groups().length === 0) {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'decklist.suggestions.empty' | translate }}</p>
        } @else {
          <div class="space-y-3">
            @for (group of groups(); track group.relation) {
              <div class="space-y-1.5">
                <h4 class="text-[11px] font-semibold uppercase tracking-wide text-base-content/55 flex items-center gap-2">
                  {{ group.labelKey | translate }}
                  <span class="badge badge-ghost badge-xs">{{ group.suggestions.length }}</span>
                </h4>
                <ul class="space-y-1">
                  @for (item of group.suggestions; track item.cardId) {
                    <li>
                      <button
                        type="button"
                        class="w-full flex items-center gap-2 p-1.5 rounded-lg border border-transparent hover:border-primary/25 hover:bg-primary/5 text-left transition-colors"
                        (click)="cardSelected.emit(item)"
                      >
                        <img
                          [src]="item.imageSmall"
                          [alt]=""
                          class="w-8 h-11 object-cover rounded shadow-sm shrink-0"
                          loading="lazy"
                        />
                        <div class="flex-1 min-w-0">
                          <p class="text-xs sm:text-sm font-medium truncate">{{ item.name }}</p>
                          <p class="text-[10px] text-base-content/55 truncate">
                            {{ item.reasonKey | translate: item.reasonParams }}
                          </p>
                        </div>
                        <span class="badge badge-primary badge-xs shrink-0 tabular-nums">
                          +{{ item.suggestedQty ?? 1 }}
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              </div>
            }
          </div>
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

  readonly directions: Array<{ id: DeckCompletionDirection; labelKey: string }> = [
    { id: 'archetype', labelKey: 'decklist.completion.dir.archetype' },
    { id: 'combo', labelKey: 'decklist.completion.dir.combo' },
    { id: 'staples', labelKey: 'decklist.completion.dir.staples' },
    { id: 'side_meta', labelKey: 'decklist.completion.dir.sideMeta' },
  ];
}
