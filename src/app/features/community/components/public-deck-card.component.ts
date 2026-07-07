import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommunityPublicDeckEntry } from '../models/community.model';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-public-deck-card',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="public-deck-card block relative w-full aspect-[4/5] rounded-xl overflow-hidden text-left border border-base-300/70 hover:border-primary/50 transition-colors"
      (click)="selected.emit(deck())"
    >
      @if (deck().coverImage; as cover) {
        <img class="public-deck-card-cover" [src]="cover" [alt]="" aria-hidden="true" loading="lazy" />
      } @else {
        <div class="public-deck-card-fallback" aria-hidden="true"></div>
      }
      <div class="public-deck-card-vignette" aria-hidden="true"></div>
      <div class="public-deck-card-footer">
        <p class="public-deck-card-name">{{ deck().deckName }}</p>
        <p class="public-deck-card-meta">
          {{ 'decklist.tile.subtitle' | translate: { count: '' + deck().cardCount, format: deck().formatLabel } }}
        </p>
        @if (showOwner()) {
          <p class="public-deck-card-owner">@{{ deck().ownerHandle }}</p>
        }
      </div>
    </button>
  `,
})
export class PublicDeckCardComponent {
  readonly deck = input.required<CommunityPublicDeckEntry>();
  readonly showOwner = input(true);
  readonly selected = output<CommunityPublicDeckEntry>();
}
