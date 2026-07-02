import { Component, inject, input } from '@angular/core';
import { BanlistStatus } from '../../models/ygo-format.model';
import { AddToDecklistPayload } from '../../models/decklist.model';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../stores/decklist.store';

@Component({
  selector: 'app-add-to-decklist-btn',
  standalone: true,
  template: `
    <button
      type="button"
      class="btn btn-primary btn-xs btn-square shrink-0"
      [class.btn-disabled]="!canAdd()"
      [disabled]="!canAdd()"
      [attr.aria-label]="i18n.t('decklist.add')"
      [title]="buttonTitle()"
      (click)="onAdd($event)"
    >
      +
    </button>
  `,
})
export class AddToDecklistButtonComponent {
  readonly payload = input.required<AddToDecklistPayload>();
  readonly banlistStatus = input<BanlistStatus | null>(null);

  private readonly decklistStore = inject(DecklistStore);
  protected readonly i18n = inject(I18nService);

  canAdd(): boolean {
    return this.decklistStore.canAdd({
      ...this.payload(),
      banlistStatus: this.banlistStatus(),
    });
  }

  buttonTitle(): string {
    if (!this.canAdd()) {
      const status = this.banlistStatus();
      if (status === 'Forbidden') {
        return this.i18n.t('decklist.feedback.forbidden');
      }
      return this.i18n.t('decklist.feedback.maxReached');
    }
    const qty = this.decklistStore.quantityInActive(this.payload().id);
    return qty > 0
      ? this.i18n.t('decklist.addWithQty', { qty: `${qty}` })
      : this.i18n.t('decklist.add');
  }

  onAdd(event: Event): void {
    event.stopPropagation();
    this.decklistStore.addCard({
      ...this.payload(),
      banlistStatus: this.banlistStatus(),
    });
  }
}
