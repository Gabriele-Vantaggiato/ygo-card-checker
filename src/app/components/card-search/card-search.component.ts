import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { CardSearchResultRowComponent } from '../card-search-result-row/card-search-result-row.component';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { LoadingSkeletonComponent } from '../../shared/ui/loading-skeleton/loading-skeleton.component';
import { SearchToolbarComponent } from '../../shared/ui/search-toolbar/search-toolbar.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-search',
  standalone: true,
  imports: [CardSearchResultRowComponent, TranslatePipe, LoadingSkeletonComponent, SearchToolbarComponent],
  host: { class: 'block' },
  template: `
    <div class="checker-search w-full relative">
      <div class="checker-search-toolbar-slot">
        <app-search-toolbar
          [query]="query()"
          [loading]="loading() || legalityLoading()"
          [filtersOpen]="filtersOpen()"
          [filterCount]="filterCount()"
          (queryChange)="queryChange.emit($event)"
          (search)="search.emit()"
          (filtersToggle)="filtersToggle.emit()"
        />
      </div>

      <div class="checker-search-results">
        @if (loading() && suggestions().length === 0) {
          <app-loading-skeleton [rows]="4" rowClass="h-10 w-full" />
        } @else {
          @for (card of suggestions(); track card.id) {
            <app-card-search-result-row
              [card]="card"
              [legality]="legalityFor(card.id)"
              [legalityLoading]="legalityLoading()"
              [active]="card.id === selectedCardId()"
              [qtyInDeck]="qtyInDeck(card.id)"
              (cardSelect)="selectCard($event)"
            />
          } @empty {
            @if (!loading()) {
              <p class="checker-search-empty">{{ 'search.noResults' | translate }}</p>
            }
          }
        }
      </div>
    </div>
  `,
})
export class CardSearchComponent {
  readonly query = input.required<string>();
  readonly suggestions = input.required<YgoCard[]>();
  readonly suggestionLegality = input<ReadonlyMap<number, LegalityResult>>(new Map());
  readonly loading = input(false);
  readonly legalityLoading = input(false);
  readonly selectedCardId = input<number | null>(null);
  readonly deckQuantities = input<ReadonlyMap<number, number>>(new Map());
  readonly filtersOpen = input(false);
  readonly filterCount = input(0);

  readonly queryChange = output<string>();
  readonly cardSelected = output<YgoCard>();
  readonly search = output<void>();
  readonly filtersToggle = output<void>();

  legalityFor(cardId: number): LegalityResult | null {
    return this.suggestionLegality().get(cardId) ?? null;
  }

  qtyInDeck(cardId: number): number {
    return this.deckQuantities().get(cardId) ?? 0;
  }

  selectCard(card: YgoCard): void {
    this.cardSelected.emit(card);
  }
}
