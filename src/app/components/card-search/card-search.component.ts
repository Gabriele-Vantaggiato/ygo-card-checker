import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { CardSearchResultRowComponent } from '../card-search-result-row/card-search-result-row.component';
import { I18nService } from '../../services/i18n.service';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-search',
  standalone: true,
  imports: [CardSearchResultRowComponent,
    TranslatePipe],
  host: { class: 'block lg:flex lg:flex-col lg:min-h-0 lg:flex-1' },
  template: `
    <div class="form-control w-full relative lg:flex lg:flex-col lg:min-h-0 lg:flex-1">
      <input
        type="text"
        class="input input-bordered input-sm sm:input-md w-full"
        [placeholder]="'search.placeholder' | translate"
        [attr.aria-label]="'search.label' | translate"
        [value]="query()"
        (input)="onInput($event)"
        autocomplete="off"
      />

      @if (loading() || legalityLoading()) {
        <p class="text-[11px] text-base-content/50 mt-1.5 px-0.5">{{ 'search.loading' | translate }}</p>
      }

      @if (showDropdown()) {
        <ul
          class="bg-base-100 rounded-box border border-base-300 absolute z-20 w-full top-full mt-1 max-h-[min(70vh,28rem)] overflow-y-auto shadow-xl p-1.5 space-y-1 lg:hidden"
        >
          @if (loading() && listCards().length === 0) {
            <li class="px-3 py-4 text-sm text-base-content/60">{{ 'search.loading' | translate }}</li>
          } @else {
            @for (card of listCards(); track card.id) {
            <li>
              <app-card-search-result-row
                [card]="card"
                [legality]="legalityFor(card.id)"
                [legalityLoading]="legalityLoading()"
                [active]="card.id === selectedCardId()"
                [qtyInDeck]="qtyInDeck(card.id)"
                (cardSelect)="selectCard($event)"
              />
            </li>
          } @empty {
            <li class="px-3 py-4 text-sm text-base-content/60">{{ 'search.noResults' | translate }}</li>
          }
          }
        </ul>
      }

      @if (showDesktopList()) {
        <div
          class="hidden lg:flex lg:flex-col mt-3 lg:flex-1 lg:min-h-0 max-h-[min(36rem,calc(100vh-16rem))] lg:max-h-none overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1.5 space-y-1"
        >
          @for (card of listCards(); track card.id) {
            <app-card-search-result-row
              [card]="card"
              [legality]="legalityFor(card.id)"
              [legalityLoading]="legalityLoading()"
              [active]="card.id === selectedCardId()"
              [qtyInDeck]="qtyInDeck(card.id)"
              (cardSelect)="selectCard($event)"
            />
          } @empty {
            <p class="text-sm text-base-content/60 px-3 py-4">{{ 'search.noResults' | translate }}</p>
          }
        </div>
      }
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
  readonly selectedCard = input<YgoCard | null>(null);
  readonly deckQuantities = input<ReadonlyMap<number, number>>(new Map());

  readonly queryChange = output<string>();
  readonly cardSelected = output<YgoCard>();

  private readonly dropdownOpen = signal(false);

  constructor(protected readonly i18n: I18nService) {}

  showDropdown(): boolean {
    const q = this.query().trim();
    return (
      this.dropdownOpen() &&
      q.length >= 2 &&
      (this.loading() || this.listCards().length > 0)
    );
  }

  showDesktopList(): boolean {
    const q = this.query().trim();
    return q.length >= 2 && (this.loading() || this.listCards().length > 0 || this.hasSelectedInQuery());
  }

  listCards(): YgoCard[] {
    const suggestions = this.suggestions();
    if (suggestions.length > 0) {
      return suggestions;
    }

    const selected = this.selectedCard();
    if (selected && this.hasSelectedInQuery()) {
      return [selected];
    }

    return [];
  }

  legalityFor(cardId: number): LegalityResult | null {
    return this.suggestionLegality().get(cardId) ?? null;
  }

  qtyInDeck(cardId: number): number {
    return this.deckQuantities().get(cardId) ?? 0;
  }

  private hasSelectedInQuery(): boolean {
    const selected = this.selectedCard();
    if (!selected) {
      return false;
    }
    return this.query().trim().toLowerCase() === selected.name.toLowerCase();
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dropdownOpen.set(true);
    this.queryChange.emit(value);
  }

  selectCard(card: YgoCard): void {
    this.dropdownOpen.set(false);
    this.cardSelected.emit(card);
  }
}
