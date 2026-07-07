import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { deckInitial } from '../../shared/utils/deck-display.utils';
import { Decklist } from '../../models/decklist.model';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../features/decklist/stores/decklist.store';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-grid',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <section>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        <button
          type="button"
          class="group aspect-[4/5] rounded-xl border border-dashed border-primary/35 bg-base-100/50 hover:bg-primary/5 hover:border-primary/60 transition-colors flex flex-col items-center justify-center gap-2"
          [attr.aria-label]="'decklist.create.button' | translate"
          (click)="createRequested.emit()"
        >
          <span
            class="w-10 h-10 rounded-full border border-primary/50 text-primary flex items-center justify-center text-2xl font-light"
          >
            +
          </span>
          <span class="text-xs font-medium text-primary/80">{{ 'decklist.grid.add' | translate }}</span>
        </button>

        @for (deck of decklistStore.decklists(); track deck.id) {
          <button
            type="button"
            class="group aspect-[4/5] rounded-xl border text-left overflow-hidden transition-all hover:shadow-md"
            [class.border-primary]="deck.id === decklistStore.activeDecklistId()"
            [class.ring-2]="deck.id === decklistStore.activeDecklistId()"
            [class.ring-primary/40]="deck.id === decklistStore.activeDecklistId()"
            [class.border-base-300]="deck.id !== decklistStore.activeDecklistId()"
            [class.bg-neutral]="deck.id !== decklistStore.activeDecklistId()"
            (click)="deckSelected.emit(deck.id)"
          >
            <div class="relative h-full flex flex-col text-neutral-content p-3 overflow-hidden">
              @if (deckCover(deck); as cover) {
                <div
                  class="absolute inset-0 bg-cover bg-center scale-105"
                  [style.background-image]="'url(' + cover + ')'"
                  aria-hidden="true"
                ></div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" aria-hidden="true"></div>
              } @else {
                <div class="absolute inset-0 bg-gradient-to-b from-neutral to-neutral-focus" aria-hidden="true"></div>
              }

              <div class="relative z-10 flex-1 flex items-center justify-center">
                @if (!deckCover(deck)) {
                  <span
                    class="w-14 h-16 rounded-lg bg-primary/90 border border-primary-content/20 shadow-md flex items-center justify-center text-lg font-bold text-primary-content"
                  >
                    {{ deckInitial(deck.name) }}
                  </span>
                }
              </div>
              <div class="relative z-10 pt-2 border-t border-white/10">
                <p class="font-semibold text-sm truncate">{{ deck.name }}</p>
                <p class="text-[11px] text-neutral-content/75 mt-0.5">
                  {{ deckCountLabel(deck) }}
                </p>
              </div>
            </div>
          </button>
        }
      </div>
    </section>
  `,
})
export class DecklistGridComponent {
  readonly deckSelected = output<string>();
  readonly createRequested = output<void>();

  protected readonly decklistStore = inject(DecklistStore);
  protected readonly i18n = inject(I18nService);

  protected readonly deckInitial = deckInitial;

  deckCountLabel(deck: Decklist): string {
    return this.i18n.t('decklist.deckCardCount', {
      total: `${this.decklistStore.totalCardsForDeck(deck.id)}`,
      unique: `${this.decklistStore.uniqueCardsForDeck(deck.id)}`,
    });
  }

  deckCover(deck: Decklist): string | null {
    return deck.cards[0]?.imageUrlSmall ?? null;
  }
}
