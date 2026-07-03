import { Component, input, output } from '@angular/core';
import { SearchHistoryEntry } from '../../models/search-history.model';
import { I18nService } from '../../services/i18n.service';
import {
  verdictBadgeClass,
  verdictLabelKey,
} from '../../utils/legality-display.utils';

@Component({
  selector: 'app-search-history',
  standalone: true,
  imports: [],
  template: `
  <section class="flex flex-col min-h-0 min-w-0 w-full overflow-hidden" [class.mt-auto]="pinned()">
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
        class="flex flex-col gap-0.5 w-full min-w-0 bg-base-200/60 rounded-box border border-base-300 p-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
        [style.max-height]="listMaxHeight()"
      >
        @for (entry of entries(); track entry.id) {
          <li class="w-full min-w-0 shrink-0">
            <div
              class="flex w-full min-w-0 items-stretch gap-0.5 rounded-lg overflow-hidden"
              [class.bg-base-300]="entry.id === selectedCardId()"
            >
              <button
                type="button"
                class="flex flex-1 items-start gap-2 py-2 px-2 h-auto min-h-0 min-w-0 overflow-hidden whitespace-normal rounded-lg text-left"
                (click)="cardSelected.emit(entry)"
              >
                @if (entry.imageUrlSmall; as src) {
                  <img
                    [src]="src"
                    [alt]=""
                    class="w-7 h-10 sm:w-8 sm:h-11 object-cover rounded shrink-0 mt-0.5"
                    loading="lazy"
                  />
                } @else {
                  <span class="w-7 h-10 sm:w-8 sm:h-11 rounded bg-base-300 shrink-0 mt-0.5"></span>
                }

                <span class="flex flex-col items-start min-w-0 flex-1 gap-1 text-left">
                  <span class="font-medium text-xs sm:text-sm leading-snug line-clamp-2 w-full pr-1">
                    {{ entry.name }}
                  </span>

                  @if (hasLegality(entry)) {
                    <span class="w-full">
                      <span
                        class="badge badge-xs sm:badge-sm"
                        [class]="verdictBadgeClass(entry.verdict!)"
                        [title]="i18n.t('history.playability')"
                      >
                        {{ i18n.t(verdictLabelKey(entry.verdict!)) }}
                      </span>
                    </span>
                  } @else if (entry.formatId !== formatId()) {
                    <span class="text-[10px] sm:text-xs opacity-50">{{ i18n.t('history.stale') }}</span>
                  }
                </span>
              </button>

              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square shrink-0 self-center text-base-content/40 hover:text-error"
                [attr.aria-label]="i18n.t('history.remove')"
                [title]="i18n.t('history.remove')"
                (click)="onRemove($event, entry.id)"
              >
                ✕
              </button>
            </div>
          </li>
        }
      </ul>
    }
  </section>
  `,
})
export class SearchHistoryComponent {
  /** Row height estimate for capping visible list at 8 items. */
  private static readonly ROW_HEIGHT_PX = 56;
  private static readonly MAX_VISIBLE = 8;

  readonly entries = input.required<SearchHistoryEntry[]>();
  readonly selectedCardId = input<number | null>(null);
  readonly formatId = input.required<string>();
  readonly pinned = input(false);

  readonly cardSelected = output<SearchHistoryEntry>();
  readonly remove = output<number>();
  readonly clear = output<void>();

  constructor(protected readonly i18n: I18nService) {}

  listMaxHeight(): string {
    const visible = Math.min(this.entries().length, SearchHistoryComponent.MAX_VISIBLE);
    return `${visible * SearchHistoryComponent.ROW_HEIGHT_PX}px`;
  }

  onRemove(event: Event, cardId: number): void {
    event.stopPropagation();
    this.remove.emit(cardId);
  }

  hasLegality(entry: SearchHistoryEntry): boolean {
    return (
      entry.formatId === this.formatId() &&
      entry.verdict !== null &&
      entry.banlistStatus !== null
    );
  }

  protected readonly verdictBadgeClass = verdictBadgeClass;
  protected readonly verdictLabelKey = verdictLabelKey;
}
