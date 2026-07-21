import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { CardSearchResultRowComponent } from '../card-search-result-row/card-search-result-row.component';
import { I18nService } from '../../services/i18n.service';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { LoadingSkeletonComponent } from '../../shared/ui/loading-skeleton/loading-skeleton.component';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-search',
  standalone: true,
  imports: [CardSearchResultRowComponent, TranslatePipe, LoadingSkeletonComponent],
  host: { class: 'block lg:flex lg:flex-col lg:min-h-0 lg:flex-1' },
  template: `
    <div class="checker-search w-full relative lg:flex lg:flex-col lg:min-h-0 lg:flex-1">
      <label class="checker-search-field">
        <span class="sr-only">{{ 'search.label' | translate }}</span>
        <svg
          class="checker-search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          class="checker-search-input input input-bordered w-full"
          [placeholder]="'search.placeholder' | translate"
          [attr.aria-label]="'search.label' | translate"
          [value]="query()"
          (input)="onInput($event)"
          autocomplete="off"
          enterkeyhint="search"
        />
        @if (loading() || legalityLoading()) {
          <span class="loading loading-spinner loading-sm checker-search-spinner text-primary"></span>
        }
      </label>

      @if (!showDropdown() && !showDesktopList() && query().trim().length < 2) {
        <p class="checker-search-hint">{{ 'search.hint' | translate }}</p>
      } @else if (loading() || legalityLoading()) {
        <p class="checker-search-hint">{{ 'search.loading' | translate }}</p>
      }

      @if (showDropdown()) {
        <ul class="checker-search-results lg:hidden">
          @if (loading() && listCards().length === 0) {
            <li class="px-1 py-1">
              <app-loading-skeleton [rows]="3" rowClass="h-10 w-full" />
            </li>
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
              <li class="checker-search-empty">{{ 'search.noResults' | translate }}</li>
            }
          }
        </ul>
      }

      @if (showDesktopList()) {
        <div class="checker-search-results hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0 lg:max-h-none">
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
            @if (loading()) {
              <app-loading-skeleton [rows]="4" rowClass="h-10 w-full" />
            } @else {
              <p class="checker-search-empty">{{ 'search.noResults' | translate }}</p>
            }
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
