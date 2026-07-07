import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Decklist } from '../../models/decklist.model';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../features/decklist/stores/decklist.store';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DecklistTileComponent } from './decklist-tile.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-grid',
  standalone: true,
  imports: [TranslatePipe, DecklistTileComponent],
  template: `
    <section>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        <button
          type="button"
          class="deck-create-tile"
          [attr.aria-label]="'decklist.create.button' | translate"
          (click)="createRequested.emit()"
        >
          <span class="deck-create-icon">+</span>
          <span class="text-xs font-medium text-primary/85">{{ 'decklist.grid.add' | translate }}</span>
        </button>

        @for (deck of decklistStore.decklists(); track deck.id) {
          <button
            type="button"
            class="aspect-[4/5] rounded-xl border transition-all duration-200 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5"
            [class.border-primary]="deck.id === decklistStore.activeDecklistId()"
            [class.ring-2]="deck.id === decklistStore.activeDecklistId()"
            [class.ring-primary/50]="deck.id === decklistStore.activeDecklistId()"
            [class.border-base-300/80]="deck.id !== decklistStore.activeDecklistId()"
            (click)="deckSelected.emit(deck.id)"
          >
            <app-decklist-tile [deck]="deck" [meta]="deckCountLabel(deck)" />
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

  deckCountLabel(deck: Decklist): string {
    return this.i18n.t('decklist.deckCardCount', {
      total: `${this.decklistStore.totalCardsForDeck(deck.id)}`,
      unique: `${this.decklistStore.uniqueCardsForDeck(deck.id)}`,
    });
  }
}
