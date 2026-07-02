import { Component, inject, input, output } from '@angular/core';
import { CardRelatedGroup, CardRelatedSuggestion } from '../../models/card-knowledge.model';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-deck-suggestions-panel',
  standalone: true,
  template: `
    <section class="card bg-base-100 shadow-xl border border-base-300">
      <div class="card-body p-4 sm:p-6 space-y-4">
        <header class="space-y-1">
          <h3 class="font-bold text-lg">{{ i18n.t('decklist.suggestions.title') }}</h3>
          <p class="text-sm text-base-content/60">
            {{ i18n.t('decklist.suggestions.subtitle', { count: '' + sourceCount() }) }}
          </p>
        </header>

        @if (!available()) {
          <p class="text-sm text-base-content/60">{{ i18n.t('knowledge.unavailable') }}</p>
        } @else if (loading()) {
          <p class="text-sm text-base-content/60">{{ i18n.t('decklist.suggestions.loading') }}</p>
        } @else if (groups().length === 0) {
          <p class="text-sm text-base-content/60">{{ i18n.t('decklist.suggestions.empty') }}</p>
        } @else {
          <div class="space-y-4">
            @for (group of groups(); track group.relation) {
              <div class="space-y-2">
                <h4 class="text-sm font-semibold text-base-content/80">
                  {{ i18n.t(group.labelKey) }}
                  <span class="badge badge-ghost badge-xs ml-1">{{ group.suggestions.length }}</span>
                </h4>
                <ul class="space-y-2">
                  @for (item of group.suggestions; track item.cardId) {
                    <li>
                      <button
                        type="button"
                        class="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-base-200/80 text-left transition-colors"
                        (click)="cardSelected.emit(item)"
                      >
                        <img [src]="item.imageSmall" [alt]="" class="w-9 h-12 object-cover rounded shrink-0" loading="lazy" />
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium truncate">{{ item.name }}</p>
                          <p class="text-[11px] text-base-content/60 truncate">
                            {{ i18n.t(item.reasonKey, item.reasonParams) }}
                          </p>
                        </div>
                        <span class="badge badge-primary badge-xs shrink-0">
                          +{{ item.suggestedQty ?? 1 }}
                        </span>
                        @if (item.maxCopies !== undefined && item.maxCopies < 3) {
                          <span class="badge badge-xs shrink-0 badge-warning">
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
