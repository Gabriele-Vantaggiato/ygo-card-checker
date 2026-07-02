import { Component, input, output } from '@angular/core';
import { LegalityVerdict } from '../../models/ygo-card.model';
import { BanlistStatus } from '../../models/ygo-format.model';
import { AddToDecklistPayload } from '../../models/decklist.model';
import { SearchHistoryEntry } from '../../models/search-history.model';
import { AddToDecklistButtonComponent } from '../add-to-decklist-btn/add-to-decklist-btn.component';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-search-history',
  standalone: true,
  imports: [AddToDecklistButtonComponent],
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
        [class.max-h-52]="pinned()"
        [class.max-h-72]="!pinned()"
      >
        @for (entry of entries(); track entry.id) {
          <li>
            <div
              class="flex w-full items-stretch gap-0.5 rounded-lg"
              [class.bg-base-300]="entry.id === selectedCardId()"
            >
              <app-add-to-decklist-btn
                class="self-center ml-1"
                [payload]="toPayload(entry)"
                [banlistStatus]="entryBanlistStatus(entry)"
              />

              <button
                type="button"
                class="!flex !flex-1 !items-start gap-2 py-2 px-2 h-auto min-h-0 min-w-0 whitespace-normal rounded-lg"
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
                    <span class="flex flex-wrap items-center gap-1 w-full">
                      <span
                        class="badge badge-xs sm:badge-sm"
                        [class]="verdictBadgeClass(entry.verdict!)"
                        [title]="i18n.t('history.playability')"
                      >
                        {{ verdictLabel(entry.verdict!) }}
                      </span>
                      <span
                        class="badge badge-xs sm:badge-sm badge-outline"
                        [class]="quantityBadgeClass(entry.banlistStatus!)"
                        [title]="i18n.t('history.quantity')"
                      >
                        {{ quantityLabel(entry.banlistStatus!) }}
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
  readonly entries = input.required<SearchHistoryEntry[]>();
  readonly selectedCardId = input<number | null>(null);
  readonly formatId = input.required<string>();
  readonly pinned = input(false);

  readonly cardSelected = output<SearchHistoryEntry>();
  readonly remove = output<number>();
  readonly clear = output<void>();

  constructor(protected readonly i18n: I18nService) {}

  onRemove(event: Event, cardId: number): void {
    event.stopPropagation();
    this.remove.emit(cardId);
  }

  toPayload(entry: SearchHistoryEntry): AddToDecklistPayload {
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      imageUrlSmall: entry.imageUrlSmall,
      banlistStatus: this.hasLegality(entry) ? entry.banlistStatus : null,
      legalityVerdict: this.hasLegality(entry) ? entry.verdict : null,
    };
  }

  entryBanlistStatus(entry: SearchHistoryEntry): BanlistStatus | null {
    return this.hasLegality(entry) ? entry.banlistStatus : null;
  }

  hasLegality(entry: SearchHistoryEntry): boolean {
    return (
      entry.formatId === this.formatId() &&
      entry.verdict !== null &&
      entry.banlistStatus !== null
    );
  }

  verdictLabel(verdict: LegalityVerdict): string {
    switch (verdict) {
      case 'legal':
        return this.i18n.t('result.legal');
      case 'restricted':
        return this.i18n.t('result.restricted');
      default:
        return this.i18n.t('result.notLegal');
    }
  }

  quantityLabel(status: BanlistStatus): string {
    switch (status) {
      case 'Forbidden':
        return this.i18n.t('history.quantity.forbidden');
      case 'Limited':
        return this.i18n.t('history.quantity.limited');
      case 'Semi-Limited':
        return this.i18n.t('history.quantity.semiLimited');
      default:
        return this.i18n.t('history.quantity.unlimited');
    }
  }

  verdictBadgeClass(verdict: LegalityVerdict): string {
    switch (verdict) {
      case 'legal':
        return 'badge-success';
      case 'restricted':
        return 'badge-warning';
      default:
        return 'badge-error';
    }
  }

  quantityBadgeClass(status: BanlistStatus): string {
    switch (status) {
      case 'Forbidden':
        return 'badge-error';
      case 'Limited':
      case 'Semi-Limited':
        return 'badge-warning';
      default:
        return 'badge-success';
    }
  }
}
