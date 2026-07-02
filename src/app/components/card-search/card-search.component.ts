import { Component, input, output, signal } from '@angular/core';
import { YgoCard } from '../../models/ygo-card.model';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-card-search',
  standalone: true,
  template: `
    <div class="form-control w-full relative">
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
          class="menu bg-base-100 rounded-box border border-base-300 absolute z-20 w-full top-full mt-1 max-h-64 overflow-y-auto shadow-lg"
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
    </div>
  `,
})
export class CardSearchComponent {
  readonly query = input.required<string>();
  readonly suggestions = input.required<YgoCard[]>();
  readonly loading = input(false);

  readonly queryChange = output<string>();
  readonly cardSelected = output<YgoCard>();

  private readonly dropdownOpen = signal(false);

  constructor(protected readonly i18n: I18nService) {}

  showDropdown(): boolean {
    return (
      this.dropdownOpen() && this.query().trim().length >= 2 && !this.loading()
    );
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
