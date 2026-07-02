import { Component, input, output } from '@angular/core';
import { SearchHistoryEntry } from '../../models/search-history.model';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-search-history',
  standalone: true,
  template: `
  <section class="flex flex-col min-h-0" [class.mt-auto]="pinned()">
    <div class="flex items-center justify-between gap-2 mb-2">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/80">
        {{ i18n.t('history.title') }}
      </h3>
      @if (entries().length > 0) {
        <button
          type="button"
          class="btn btn-ghost btn-xs text-base-content/60"
          (click)="clear.emit()"
        >
          {{ i18n.t('history.clear') }}
        </button>
      }
    </div>

    @if (entries().length === 0) {
      <p class="text-xs text-base-content/50 py-2">{{ i18n.t('history.empty') }}</p>
    } @else {
      <ul
        class="menu menu-sm bg-base-200/60 rounded-box border border-base-300 p-1 gap-0.5 overflow-y-auto"
        [class.max-h-48]="pinned()"
        [class.max-h-64]="!pinned()"
      >
        @for (entry of entries(); track entry.id) {
          <li>
            <button
              type="button"
              class="flex items-center gap-2 py-2"
              [class.active]="entry.id === selectedCardId()"
              (click)="cardSelected.emit(entry)"
            >
              @if (entry.imageUrlSmall; as src) {
                <img
                  [src]="src"
                  [alt]=""
                  class="w-8 h-11 object-cover rounded shrink-0"
                  loading="lazy"
                />
              } @else {
                <span class="w-8 h-11 rounded bg-base-300 shrink-0"></span>
              }
              <span class="flex flex-col items-start min-w-0 text-left">
                <span class="font-medium text-sm truncate w-full">{{ entry.name }}</span>
                <span class="text-xs opacity-60 truncate w-full">{{ entry.type }}</span>
              </span>
            </button>
          </li>
        }
      </ul>
    }
  </section>
  `,
})
export class SearchHistoryComponent {
  readonly entries = input.required<SearchHistoryEntry[]>();
  readonly selectedCardId = input<number | null>(null);
  readonly pinned = input(false);

  readonly cardSelected = output<SearchHistoryEntry>();
  readonly clear = output<void>();

  constructor(protected readonly i18n: I18nService) {}
}
