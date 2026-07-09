import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { SearchHistoryEntry } from '../../models/search-history.model';
import { I18nService } from '../../services/i18n.service';
import {
  verdictBadgeClass,
  verdictLabelKey,
} from '../../utils/legality-display.utils';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-search-history',
  standalone: true,
  imports: [NgClass,
    TranslatePipe],
  template: `
  <details class="group" [attr.open]="entries().length > 0 ? true : null">
    <summary class="flex items-center justify-between gap-2 mb-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-base-content/60 flex items-center gap-1.5">
        <span class="text-primary/70 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        {{ 'history.title' | translate }}
        @if (entries().length > 0) {
          <span class="badge badge-ghost badge-sm min-w-[1.5rem] px-2 font-normal tabular-nums">{{ entries().length }}</span>
        }
      </h3>
      @if (entries().length > 0) {
        <button
          type="button"
          class="btn btn-ghost btn-xs text-base-content/60"
          (click)="onClear($event)"
        >
          {{ 'history.clear' | translate }}
        </button>
      }
    </summary>

    @if (entries().length === 0) {
      <p class="text-xs text-base-content/50 py-1">{{ 'history.empty' | translate }}</p>
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
                        class="badge badge-xs sm:badge-sm duel-verdict-badge"
                        [ngClass]="verdictBadgeClass(entry.verdict!)"
                        [title]="'history.playability' | translate"
                      >
                        {{ (verdictLabelKey(entry.verdict!)) | translate }}
                      </span>
                    </span>
                  } @else if (entry.formatId !== formatId()) {
                    <span class="text-[10px] sm:text-xs opacity-50">{{ 'history.stale' | translate }}</span>
                  }
                </span>
              </button>

              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square shrink-0 self-center text-base-content/40 hover:text-error"
                [attr.aria-label]="'history.remove' | translate"
                [title]="'history.remove' | translate"
                (click)="onRemove($event, entry.id)"
              >
                ✕
              </button>
            </div>
          </li>
        }
      </ul>
    }
  </details>
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

  onClear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.clear.emit();
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
