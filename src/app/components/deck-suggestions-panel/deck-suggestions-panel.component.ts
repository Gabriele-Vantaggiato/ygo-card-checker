import { Component, inject, input, output } from '@angular/core';
import { CardRelatedGroup, CardRelatedSuggestion } from '../../models/card-knowledge.model';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-deck-suggestions-panel',
  standalone: true,
  template: `
    <section class="duel-panel overflow-hidden">
      <div class="duel-panel-header flex items-center justify-between gap-2">
        <span>{{ i18n.t('decklist.suggestions.title') }}</span>
        @if (sourceCount() > 0) {
          <span class="badge badge-primary badge-xs font-normal normal-case tracking-normal">
            {{ i18n.t('decklist.suggestions.subtitle', { count: '' + sourceCount() }) }}
          </span>
        }
      </div>

      <div class="p-4 sm:p-5 space-y-4">
        @if (!available()) {
          <p class="text-sm text-base-content/60 text-center py-6">{{ i18n.t('knowledge.unavailable') }}</p>
        } @else if (loading()) {
          <div class="flex flex-col items-center gap-2 py-8 text-base-content/60">
            <span class="loading loading-spinner loading-sm text-primary"></span>
            <p class="text-sm">{{ i18n.t('decklist.suggestions.loading') }}</p>
          </div>
        } @else if (groups().length === 0) {
          <p class="text-sm text-base-content/60 text-center py-6">{{ i18n.t('decklist.suggestions.empty') }}</p>
        } @else {
          <div class="space-y-4">
            @for (group of groups(); track group.relation) {
              <div class="space-y-2">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-base-content/55 flex items-center gap-2">
                  {{ i18n.t(group.labelKey) }}
                  <span class="badge badge-ghost badge-xs">{{ group.suggestions.length }}</span>
                </h4>
                <ul class="space-y-1.5">
                  @for (item of group.suggestions; track item.cardId) {
                    <li>
                      <button
                        type="button"
                        class="w-full flex items-center gap-3 p-2 rounded-lg border border-transparent hover:border-primary/25 hover:bg-primary/5 text-left transition-colors"
                        (click)="cardSelected.emit(item)"
                      >
                        <img
                          [src]="item.imageSmall"
                          [alt]=""
                          class="w-9 h-12 object-cover rounded shadow-sm shrink-0"
                          loading="lazy"
                        />
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium truncate">{{ item.name }}</p>
                          <p class="text-[11px] text-base-content/55 truncate">
                            {{ i18n.t(item.reasonKey, item.reasonParams) }}
                          </p>
                        </div>
                        <span class="badge badge-primary badge-sm shrink-0 tabular-nums">
                          +{{ item.suggestedQty ?? 1 }}
                        </span>
                        @if (item.maxCopies !== undefined && item.maxCopies < 3) {
                          <span class="badge badge-warning badge-xs shrink-0">
                            {{ i18n.t('knowledge.maxCopies', { count: '' + item.maxCopies }) }}
                          </span>
                        }
                      </button>
                    </li>
                  }
                </ul>
              </div>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class DeckSuggestionsPanelComponent {
  readonly loading = input(false);
  readonly available = input(true);
  readonly sourceCount = input(0);
  readonly groups = input<CardRelatedGroup[]>([]);

  readonly cardSelected = output<CardRelatedSuggestion>();

  protected readonly i18n = inject(I18nService);
}
