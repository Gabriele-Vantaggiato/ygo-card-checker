import { Component, inject, output } from '@angular/core';
import { Decklist } from '../../models/decklist.model';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../stores/decklist.store';

@Component({
  selector: 'app-decklist-grid',
  standalone: true,
  template: `
    <section class="space-y-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg sm:text-xl font-bold tracking-wide uppercase">
            {{ i18n.t('decklist.grid.title') }}
          </h2>
          <p class="text-xs sm:text-sm text-base-content/60 mt-0.5">
            {{ i18n.t('decklist.grid.count', { count: '' + decklistStore.decklists().length }) }}
          </p>
        </div>
      </header>

      <div
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4"
      >
        <button
          type="button"
          class="group aspect-[4/5] rounded-xl border-2 border-dashed border-primary/40 bg-base-200/40 hover:bg-primary/10 hover:border-primary transition-all flex flex-col items-center justify-center gap-3"
          [attr.aria-label]="i18n.t('decklist.create.button')"
          (click)="createRequested.emit()"
        >
          <span
            class="w-14 h-14 rounded-full border-2 border-primary text-primary flex items-center justify-center text-3xl font-light group-hover:scale-105 transition-transform"
          >
            +
          </span>
          <span class="text-xs font-medium text-primary/80">{{ i18n.t('decklist.grid.add') }}</span>
        </button>

        @for (deck of decklistStore.decklists(); track deck.id) {
          <button
            type="button"
            class="group aspect-[4/5] rounded-xl border-2 text-left overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg"
            [class.border-primary]="deck.id === decklistStore.activeDecklistId()"
            [class.shadow-primary/25]="deck.id === decklistStore.activeDecklistId()"
            [class.shadow-lg]="deck.id === decklistStore.activeDecklistId()"
            [class.ring-2]="deck.id === decklistStore.activeDecklistId()"
            [class.ring-primary/50]="deck.id === decklistStore.activeDecklistId()"
            [class.border-base-300]="deck.id !== decklistStore.activeDecklistId()"
            [class.bg-neutral]="deck.id !== decklistStore.activeDecklistId()"
            (click)="deckSelected.emit(deck.id)"
          >
            <div class="relative h-full flex flex-col text-neutral-content p-3 overflow-hidden">
              @if (deckCover(deck); as cover) {
                <div
                  class="absolute inset-0 bg-cover bg-center scale-110"
                  [style.background-image]="'url(' + cover + ')'"
                  aria-hidden="true"
                ></div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-black/40" aria-hidden="true"></div>
              } @else {
                <div class="absolute inset-0 bg-gradient-to-b from-neutral to-neutral-focus" aria-hidden="true"></div>
              }

              <div class="relative z-10 flex-1 flex items-center justify-center">
                @if (!deckCover(deck)) {
                  <div class="relative w-16 sm:w-20 h-20 sm:h-24">
                    <span
                      class="absolute inset-x-2 bottom-0 h-14 sm:h-16 rounded-md bg-primary/80 border border-primary-content/20 shadow-inner"
                    ></span>
                    <span
                      class="absolute inset-x-4 bottom-3 h-12 sm:h-14 rounded-md bg-primary border border-primary-content/30 shadow-md"
                    ></span>
                    <span
                      class="absolute inset-x-6 bottom-6 h-10 sm:h-12 rounded-md bg-primary-focus border border-primary-content/40 shadow-lg flex items-center justify-center text-xs font-bold text-primary-content"
                    >
                      {{ deckInitial(deck.name) }}
                    </span>
                  </div>
                }
              </div>
              <div class="relative z-10 pt-2 border-t border-white/15">
                <p class="font-semibold text-sm truncate drop-shadow">{{ deck.name }}</p>
                <p class="text-[11px] text-neutral-content/80 mt-0.5 drop-shadow">
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

  deckInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

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
