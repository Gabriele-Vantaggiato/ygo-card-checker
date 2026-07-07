import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CardRelatedGroup, CardRelatedSuggestion } from '../../models/card-knowledge.model';
import { I18nService } from '../../services/i18n.service';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-deck-suggestions-panel',
  standalone: true,
  imports: [TranslatePipe, DuelPanelComponent],
  template: `
    <app-duel-panel
      [panelClass]="(compact() ? 'min-h-0 h-full' : 'min-h-0') + ' overflow-hidden flex flex-col'"
    >
      <div class="duel-panel-header flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div class="flex flex-wrap items-center gap-2 min-w-0 normal-case tracking-normal">
          <span>{{ 'decklist.suggestions.title' | translate }}</span>
          @if (formatLabel(); as format) {
            <span
              class="badge badge-outline badge-primary badge-xs font-normal"
              [title]="'format.label' | translate"
            >
              {{ format }}
            </span>
          }
        </div>
        @if (sourceCount() > 0 && !compact()) {
          <span class="badge badge-primary badge-xs font-normal normal-case tracking-normal">
            {{ 'decklist.suggestions.subtitle' | translate: { count: '' + sourceCount() } }}
          </span>
        }
      </div>

      <div
        class="p-3 sm:p-4 space-y-3 min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        [class.max-h-72]="compact()"
      >
        @if (!available()) {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'knowledge.unavailable' | translate }}</p>
        } @else if (loading()) {
          <div class="flex flex-col items-center gap-2 py-6 text-base-content/60">
            <span class="loading loading-spinner loading-sm text-primary"></span>
            <p class="text-sm">{{ 'decklist.suggestions.loading' | translate }}</p>
          </div>
        } @else if (groups().length === 0) {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'decklist.suggestions.empty' | translate }}</p>
        } @else {
          @if (sourceCount() > 0 && compact()) {
            <p class="text-[11px] text-base-content/50">
              {{ 'decklist.suggestions.subtitle' | translate: { count: '' + sourceCount() } }}
            </p>
          }
          <div class="space-y-3">
            @for (group of groups(); track group.relation) {
              <div class="space-y-1.5">
                <h4 class="text-[11px] font-semibold uppercase tracking-wide text-base-content/55 flex items-center gap-2">
                  {{ (group.labelKey) | translate }}
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
                            {{ (item.reasonKey) | translate: item.reasonParams }}
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
export class DeckSuggestionsPanelComponent {
  readonly loading = input(false);
  readonly available = input(true);
  readonly sourceCount = input(0);
  readonly groups = input<CardRelatedGroup[]>([]);
  readonly formatLabel = input<string | null>(null);
  readonly compact = input(false);

  readonly cardSelected = output<CardRelatedSuggestion>();

  protected readonly i18n = inject(I18nService);
}
