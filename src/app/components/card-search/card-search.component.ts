import { Component, input, output, signal } from '@angular/core';
import { YgoCard } from '../../models/ygo-card.model';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-card-search',
  standalone: true,
  host: { class: 'block lg:flex lg:flex-col lg:min-h-0 lg:flex-1' },
  template: `
    <div class="form-control w-full relative lg:flex lg:flex-col lg:min-h-0 lg:flex-1">
      <div class="label">
        <span class="label-text font-medium">{{ i18n.t('search.label') }}</span>
      </div>
      <input
        type="text"
        class="input input-bordered w-full"
        [placeholder]="i18n.t('search.placeholder')"
        [value]="query()"
        (input)="onInput($event)"
        autocomplete="off"
      />

      @if (loading()) {
        <div class="label">
          <span class="label-text-alt">{{ i18n.t('search.loading') }}</span>
        </div>
      }

      @if (showDropdown()) {
        <ul
          class="menu bg-base-100 rounded-box border border-base-300 absolute z-20 w-full top-full mt-1 max-h-64 overflow-y-auto shadow-lg lg:hidden"
        >
          @for (card of suggestions(); track card.id) {
            <li>
              <button type="button" (click)="selectCard(card)">
                <span>{{ card.name }}</span>
                <span class="text-xs opacity-60">{{ card.type }}</span>
              </button>
            </li>
          } @empty {
            <li class="disabled">
              <span>{{ i18n.t('search.noResults') }}</span>
            </li>
          }
        </ul>
      }

      @if (showDesktopList()) {
        <ul
          class="menu bg-base-100 rounded-box border border-base-300 hidden lg:block mt-2 lg:flex-1 lg:min-h-0 max-h-[min(32rem,calc(100vh-18rem))] lg:max-h-none overflow-y-auto"
        >
          @for (card of listCards(); track card.id) {
            <li>
              <button
                type="button"
                class="flex-col items-start gap-0.5"
                [class.active]="card.id === selectedCardId()"
                (click)="selectCard(card)"
              >
                <span class="font-medium">{{ card.name }}</span>
                <span class="text-xs opacity-60">{{ card.type }}</span>
              </button>
            </li>
          } @empty {
            <li class="disabled">
              <span>{{ i18n.t('search.noResults') }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class CardSearchComponent {
  readonly query = input.required<string>();
  readonly suggestions = input.required<YgoCard[]>();
  readonly loading = input(false);
  readonly selectedCardId = input<number | null>(null);
  readonly selectedCard = input<YgoCard | null>(null);

  readonly queryChange = output<string>();
  readonly cardSelected = output<YgoCard>();

  private readonly dropdownOpen = signal(false);

  constructor(protected readonly i18n: I18nService) {}

  showDropdown(): boolean {
    return (
      this.dropdownOpen() && this.query().trim().length >= 2 && !this.loading()
    );
  }

  showDesktopList(): boolean {
    const q = this.query().trim();
    return q.length >= 2 && !this.loading() && (this.suggestions().length > 0 || this.hasSelectedInQuery());
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
