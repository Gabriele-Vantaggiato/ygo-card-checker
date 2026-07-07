import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Decklist } from '../../models/decklist.model';
import { deckAccentStyle, deckInitial, deckLeadCard, deckLeadImage } from '../../shared/utils/deck-display.utils';

@Component({
  selector: 'app-decklist-tile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (leadImage(); as cover) {
      <img class="deck-tile-cover" [src]="cover" [alt]="" aria-hidden="true" loading="lazy" />
      <div class="deck-tile-vignette" aria-hidden="true"></div>
      <div class="deck-tile-hero-frame" aria-hidden="true">
        <img class="deck-tile-hero-card" [src]="cover" [alt]="leadName()" loading="lazy" />
      </div>
    } @else {
      <div class="deck-tile-bg" [style.background]="accentBackground()"></div>
      <div class="deck-tile-empty-mark font-display" aria-hidden="true">{{ deckInitial(deck().name) }}</div>
    }

    <div class="deck-tile-initial font-display">{{ deckInitial(deck().name) }}</div>

    <div class="deck-tile-footer">
      <p class="deck-tile-name">{{ deck().name }}</p>
      @if (meta()) {
        <p class="deck-tile-meta">{{ meta() }}</p>
      }
    </div>
  `,
  host: {
    class: 'deck-tile block relative h-full w-full text-left overflow-hidden',
  },
})
export class DecklistTileComponent {
  readonly deck = input.required<Decklist>();
  readonly meta = input('');

  protected readonly deckInitial = deckInitial;

  leadImage(): string | null {
    return deckLeadImage(this.deck());
  }

  leadName(): string {
    return deckLeadCard(this.deck())?.name ?? this.deck().name;
  }

  accentBackground(): string {
    return deckAccentStyle(this.deck().id);
  }
}
