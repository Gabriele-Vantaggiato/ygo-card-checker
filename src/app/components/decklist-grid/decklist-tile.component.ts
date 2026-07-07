import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Decklist } from '../../models/decklist.model';
import {
  deckAccentStyle,
  deckInitial,
  deckTileCoverImage,
  deckTileFanCards,
} from '../../shared/utils/deck-display.utils';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-decklist-tile',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (coverImage(); as cover) {
      <img class="deck-tile-cover" [src]="cover" [alt]="" aria-hidden="true" loading="lazy" />
    } @else {
      <div class="deck-tile-bg" [style.background]="accentBackground()"></div>
    }

    <div class="deck-tile-vignette" aria-hidden="true"></div>

    @if (fanCards().length > 0) {
      <div class="deck-tile-stage" aria-hidden="true">
        <div class="deck-tile-box"></div>
        <div class="deck-tile-fan">
          @for (item of fanCards(); track item.card.id + item.slot) {
            <img
              class="deck-tile-fan-card"
              [class.deck-tile-fan-card-left]="item.slot === 'left'"
              [class.deck-tile-fan-card-center]="item.slot === 'center'"
              [class.deck-tile-fan-card-right]="item.slot === 'right'"
              [src]="item.card.imageUrlSmall!"
              [alt]="item.card.name"
              loading="lazy"
            />
          }
        </div>
      </div>
    } @else {
      <div class="deck-tile-empty-mark font-display" aria-hidden="true">{{ deckInitial(deck().name) }}</div>
    }

    <div class="deck-tile-caption">
      <p class="deck-tile-name">{{ deck().name }}</p>
      <p class="deck-tile-meta">
        {{ 'decklist.tile.subtitle' | translate: { count: '' + cardCount(), format: formatLabel() } }}
      </p>
    </div>
  `,
  host: {
    class: 'deck-tile deck-tile-mdpro block relative h-full w-full text-left overflow-hidden',
  },
})
export class DecklistTileComponent {
  readonly deck = input.required<Decklist>();
  readonly cardCount = input(0);
  readonly formatLabel = input('—');

  protected readonly deckInitial = deckInitial;

  readonly coverImage = computed(() => deckTileCoverImage(this.deck()));
  readonly fanCards = computed(() => deckTileFanCards(this.deck()));

  accentBackground(): string {
    return deckAccentStyle(this.deck().id);
  }
}
