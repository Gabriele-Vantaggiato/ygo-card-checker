import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgClass } from '@angular/common';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { AddToDecklistPayload, maxCopiesForStatus } from '../../models/decklist.model';
import { AddToDecklistButtonComponent } from '../add-to-decklist-btn/add-to-decklist-btn.component';
import { I18nService } from '../../services/i18n.service';
import {
  verdictBadgeClass,
  verdictLabelKey,
} from '../../utils/legality-display.utils';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-search-result-row',
  standalone: true,
  imports: [AddToDecklistButtonComponent, NgClass,
    TranslatePipe],
  template: `
    <div
      class="flex items-stretch gap-1 rounded-lg transition-colors w-full"
      [class.min-h-[3.5rem]]="compact()"
      [class.min-h-[4.25rem]]="!compact()"
      [class.bg-primary/10]="active()"
      [class.ring-1]="active()"
      [class.ring-primary/30]="active()"
    >
      @if (showAddButton()) {
        <app-add-to-decklist-btn
          class="self-center ml-1 shrink-0"
          size="md"
          [payload]="addPayload()"
          [banlistStatus]="legality()?.banlistStatus ?? null"
        />
      }

      <button
        type="button"
        class="flex-1 min-w-0 flex items-center gap-2.5 p-2 sm:p-2.5 rounded-lg hover:bg-base-200/80 text-left transition-colors"
        [class.opacity-50]="legality()?.banlistStatus === 'Forbidden'"
        (click)="cardSelect.emit(card())"
      >
        @if (card().card_images[0]?.image_url_small; as src) {
          <img
            [src]="src"
            [alt]=""
            class="w-9 h-12 sm:w-10 sm:h-14 object-cover rounded-md shadow-sm shrink-0"
            loading="lazy"
          />
        } @else {
          <span class="w-9 h-12 sm:w-10 sm:h-14 rounded-md bg-base-300 shrink-0"></span>
        }

        <div class="flex-1 min-w-0 py-0.5">
          <p class="text-sm font-semibold leading-snug line-clamp-2">{{ card().name }}</p>
          @if (!compact()) {
            <p class="text-xs text-base-content/60 truncate mt-0.5">{{ card().type }}</p>
          }
          @if (legality(); as result) {
            <span class="mt-1 inline-flex flex-wrap items-center gap-1.5">
              <span
                class="badge badge-xs duel-verdict-badge"
                [ngClass]="verdictBadgeClass(result.verdict)"
                [title]="'history.playability' | translate"
              >
                {{ (verdictLabelKey(result.verdict)) | translate }}
              </span>
              @if (result.banlistStatus !== 'Forbidden') {
                <span
                  class="deck-copy-capacity"
                  [title]="copyCapacityTitle()"
                  [attr.aria-label]="copyCapacityTitle()"
                >
                  @for (slot of copySlotIndices(); track slot) {
                    <span
                      class="deck-copy-pip"
                      [class.deck-copy-pip-filled]="slot < qtyInDeck()"
                      [class.deck-copy-pip-free]="slot >= qtyInDeck()"
                    ></span>
                  }
                  <span class="deck-copy-capacity-label tabular-nums">{{ remainingCopies() }}</span>
                </span>
              }
            </span>
          } @else if (legalityLoading()) {
            <span class="loading loading-dots loading-xs mt-1 text-base-content/40"></span>
          }
        </div>

        @if (qtyInDeck() > 0) {
          <span class="badge badge-sm badge-primary shrink-0 self-center tabular-nums">×{{ qtyInDeck() }}</span>
        }
      </button>
    </div>
  `,
})
export class CardSearchResultRowComponent {
  readonly card = input.required<YgoCard>();
  readonly legality = input<LegalityResult | null>(null);
  readonly legalityLoading = input(false);
  readonly active = input(false);
  readonly qtyInDeck = input(0);
  readonly showAddButton = input(false);
  readonly compact = input(false);

  readonly cardSelect = output<YgoCard>();

  protected readonly i18n = inject(I18nService);
  protected readonly verdictBadgeClass = verdictBadgeClass;
  protected readonly verdictLabelKey = verdictLabelKey;

  readonly maxAllowedCopies = computed(() =>
    maxCopiesForStatus(this.legality()?.banlistStatus),
  );

  readonly remainingCopies = computed(() =>
    Math.max(0, this.maxAllowedCopies() - this.qtyInDeck()),
  );

  readonly copySlotIndices = computed(() =>
    Array.from({ length: this.maxAllowedCopies() }, (_, index) => index),
  );

  copyCapacityTitle(): string {
    return this.i18n.t('search.copyCapacity', {
      remaining: `${this.remainingCopies()}`,
      max: `${this.maxAllowedCopies()}`,
      inDeck: `${this.qtyInDeck()}`,
    });
  }

  addPayload(): AddToDecklistPayload {
    const card = this.card();
    const legality = this.legality();
    return {
      id: card.id,
      name: card.name,
      type: card.type,
      imageUrlSmall: card.card_images[0]?.image_url_small ?? null,
      banlistStatus: legality?.banlistStatus ?? null,
      legalityVerdict: legality?.verdict ?? null,
    };
  }
}
