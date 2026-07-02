import { Component, input, output } from '@angular/core';
import { CardRelatedSuggestion } from '../../models/card-knowledge.model';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-card-related-panel',
  standalone: true,
  template: `
    <section class="card bg-base-100 shadow-xl border border-base-300 mt-4 sm:mt-6">
      <div class="card-body p-4 sm:p-6 space-y-4">
        <header class="space-y-1">
          <h3 class="font-bold text-lg">{{ i18n.t('knowledge.title') }}</h3>
          <p class="text-sm text-base-content/60">{{ i18n.t('knowledge.subtitle') }}</p>
        </header>

        @if (!available()) {
          <p class="text-sm text-base-content/60">{{ i18n.t('knowledge.unavailable') }}</p>
        } @else if (loading()) {
          <p class="text-sm text-base-content/60">{{ i18n.t('knowledge.loading') }}</p>
        } @else {
          @if (series().length > 0 || tags().length > 0) {
            <div class="flex flex-wrap gap-1 items-center">
              @if (series().length > 0) {
                <span class="text-xs text-base-content/50 mr-1">{{ i18n.t('knowledge.series') }}:</span>
                @for (label of series(); track label) {
                  <span class="badge badge-primary badge-sm badge-outline">{{ label }}</span>
                }
              }
            </div>
          }

          @if (suggestions().length === 0) {
            <p class="text-sm text-base-content/60">{{ i18n.t('knowledge.empty') }}</p>
          } @else {
            <ul class="space-y-2">
              @for (item of suggestions(); track item.cardId) {
                <li>
                  <button
                    type="button"
                    class="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-base-200/80 text-left transition-colors"
                    (click)="cardSelected.emit(item.cardId)"
                  >
                    <img [src]="item.imageSmall" [alt]="" class="w-9 h-12 object-cover rounded shrink-0" loading="lazy" />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{{ item.name }}</p>
                      <p class="text-[11px] text-base-content/60 truncate">
                        {{ i18n.t(item.reasonKey, item.reasonParams) }}
                      </p>
                    </div>
                    <span class="badge badge-xs shrink-0 badge-ghost">{{ relationLabel(item.relation) }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        }
      </div>
    </section>
  `,
})
export class CardRelatedPanelComponent {
  readonly loading = input(false);
  readonly available = input(true);
  readonly series = input<string[]>([]);
  readonly tags = input<string[]>([]);
  readonly suggestions = input<CardRelatedSuggestion[]>([]);

  readonly cardSelected = output<number>();

  constructor(protected readonly i18n: I18nService) {}

  relationLabel(relation: string): string {
    const key = `knowledge.relation.${relation}`;
    const translated = this.i18n.t(key);
    return translated === key ? relation : translated;
  }
}
