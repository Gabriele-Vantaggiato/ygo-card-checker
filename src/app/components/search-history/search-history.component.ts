import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
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
  imports: [NgClass, TranslatePipe],
  template: `
    <section class="checker-history">
      <header class="checker-history-header">
        <button
          type="button"
          class="checker-history-toggle"
          [attr.aria-expanded]="expanded()"
          (click)="toggleExpanded()"
        >
          <span class="checker-history-chevron" [class.rotate-90]="expanded()" aria-hidden="true"
            >›</span
          >
          <h3 class="checker-history-title">{{ 'history.title' | translate }}</h3>
          @if (entries().length > 0) {
            <span class="badge badge-primary badge-outline badge-sm tabular-nums">{{
              entries().length
            }}</span>
          }
        </button>
        @if (entries().length > 0 && expanded()) {
          <button
            type="button"
            class="btn btn-ghost btn-xs text-base-content/55 hover:text-error"
            (click)="onClear($event)"
          >
            {{ 'history.clear' | translate }}
          </button>
        }
      </header>

      @if (expanded()) {
        @if (entries().length === 0) {
          <div class="checker-history-empty">
            <p class="font-medium text-base-content/70">{{ 'history.empty' | translate }}</p>
            <p class="text-xs text-base-content/45 leading-relaxed">{{
              'history.emptyHint' | translate
            }}</p>
          </div>
        } @else {
          <ul class="checker-history-list" [style.max-height]="listMaxHeight()">
            @for (entry of entries(); track entry.id) {
              <li>
                <div
                  class="checker-history-row"
                  [class.checker-history-row-active]="entry.id === selectedCardId()"
                >
                  <button
                    type="button"
                    class="checker-history-pick"
                    (click)="onSelectEntry(entry)"
                  >
                    @if (entry.imageUrlSmall; as src) {
                      <img
                        [src]="src"
                        [alt]=""
                        class="checker-history-art"
                        loading="lazy"
                      />
                    } @else {
                      <span class="checker-history-art checker-history-art-fallback"></span>
                    }

                    <span class="flex flex-col items-start min-w-0 flex-1 gap-1 text-left">
                      <span class="font-semibold text-sm leading-snug line-clamp-2 w-full">
                        {{ entry.name }}
                      </span>

                      @if (hasLegality(entry)) {
                        <span
                          class="badge badge-sm duel-verdict-badge"
                          [ngClass]="verdictBadgeClass(entry.verdict!)"
                          [title]="'history.playability' | translate"
                        >
                          {{ verdictLabelKey(entry.verdict!) | translate }}
                        </span>
                      } @else if (entry.formatId !== formatId()) {
                        <span class="text-[11px] text-base-content/45">{{
                          'history.stale' | translate
                        }}</span>
                      }
                    </span>
                  </button>

                  <button
                    type="button"
                    class="btn btn-ghost btn-xs btn-square shrink-0 self-center text-base-content/35 hover:text-error"
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
      }
    </section>
  `,
})
export class SearchHistoryComponent {
  private static readonly ROW_HEIGHT_PX = 60;
  private static readonly MAX_VISIBLE = 6;

  readonly entries = input.required<SearchHistoryEntry[]>();
  readonly selectedCardId = input<number | null>(null);
  readonly formatId = input.required<string>();
  readonly pinned = input(false);
  /** When true, keep the list collapsed to free space for live search results. */
  readonly collapsed = input(false);

  readonly cardSelected = output<SearchHistoryEntry>();
  readonly remove = output<number>();
  readonly clear = output<void>();

  protected readonly expanded = signal(true);
  private prevCollapsed = false;

  constructor(protected readonly i18n: I18nService) {
    effect(() => {
      const c = this.collapsed();
      if (c && !this.prevCollapsed) {
        this.expanded.set(false);
      } else if (!c && this.prevCollapsed) {
        this.expanded.set(true);
      }
      this.prevCollapsed = c;
    });
  }

  collapse(): void {
    this.expanded.set(false);
  }

  toggleExpanded(): void {
    this.expanded.update((v) => !v);
  }

  onSelectEntry(entry: SearchHistoryEntry): void {
    this.expanded.set(false);
    this.cardSelected.emit(entry);
  }

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
