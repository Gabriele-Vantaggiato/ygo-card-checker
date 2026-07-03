import { Component, computed, inject, input } from '@angular/core';
import { BanlistStatus } from '../../models/ygo-format.model';
import { AddToDecklistPayload } from '../../models/decklist.model';
import { DialogService } from '../../services/dialog.service';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../stores/decklist.store';

@Component({
  selector: 'app-add-to-decklist-btn',
  standalone: true,
  template: `
    @if (variant() === 'labeled') {
      <button
        type="button"
        class="btn btn-primary btn-sm shrink-0 gap-1.5"
        [class.btn-disabled]="isForbidden()"
        [disabled]="isForbidden()"
        [attr.aria-label]="i18n.t('decklist.add')"
        [title]="buttonTitle()"
        (click)="openDialog($event)"
      >
        <span aria-hidden="true">+</span>
        {{ i18n.t('decklist.add') }}
      </button>
    } @else {
      <button
        type="button"
        class="btn btn-primary shrink-0"
        [class.btn-xs]="size() === 'sm'"
        [class.btn-sm]="size() === 'md'"
        [class.btn-square]="true"
        [class.btn-disabled]="isForbidden()"
        [disabled]="isForbidden()"
        [attr.aria-label]="i18n.t('decklist.add')"
        [title]="buttonTitle()"
        (click)="openDialog($event)"
      >
        +
      </button>
    }
  `,
})
export class AddToDecklistButtonComponent {
  readonly payload = input.required<AddToDecklistPayload>();
  readonly banlistStatus = input<BanlistStatus | null>(null);
  readonly size = input<'sm' | 'md'>('sm');
  readonly variant = input<'icon' | 'labeled'>('icon');

  private readonly dialog = inject(DialogService);
  protected readonly decklistStore = inject(DecklistStore);
  protected readonly i18n = inject(I18nService);

  readonly isForbidden = computed(() => this.decklistStore.maxCopies(this.banlistStatus()) === 0);

  buttonTitle(): string {
    if (this.isForbidden()) {
      return this.i18n.t('decklist.feedback.forbidden');
    }
    const qty = this.decklistStore.quantityInActive(this.payload().id);
    return qty > 0
      ? this.i18n.t('decklist.addWithQty', { qty: `${qty}` })
      : this.i18n.t('decklist.add');
  }

  openDialog(event: Event): void {
    event.stopPropagation();
    this.dialog.openAddToDecklist(this.payload(), this.banlistStatus());
  }
}
