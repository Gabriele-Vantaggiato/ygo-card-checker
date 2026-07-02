import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BanlistStatus } from '../../models/ygo-format.model';
import { AddToDecklistPayload } from '../../models/decklist.model';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../stores/decklist.store';

@Component({
  selector: 'app-add-to-decklist-btn',
  standalone: true,
  imports: [FormsModule],
  template: `
    <button
      type="button"
      class="btn btn-primary btn-xs btn-square shrink-0"
      [class.btn-disabled]="isForbidden()"
      [disabled]="isForbidden()"
      [attr.aria-label]="i18n.t('decklist.add')"
      [title]="buttonTitle()"
      (click)="openDialog($event)"
    >
      +
    </button>

    @if (dialogOpen()) {
      <div class="modal modal-open z-50">
        <div class="modal-box max-w-sm p-0 overflow-hidden" (click)="$event.stopPropagation()">
          <div class="bg-base-200/80 px-4 py-3 border-b border-base-300">
            <h3 class="font-bold text-base">{{ i18n.t('decklist.dialog.title') }}</h3>
            <p class="text-xs text-base-content/60 mt-0.5">{{ i18n.t('decklist.dialog.subtitle') }}</p>
          </div>

          <div class="p-4 space-y-4">
            <div class="flex items-center gap-3 rounded-lg bg-base-200/50 p-3">
              @if (payload().imageUrlSmall; as src) {
                <img [src]="src" [alt]="" class="w-10 h-14 object-cover rounded shrink-0" />
              } @else {
                <span class="w-10 h-14 rounded bg-base-300 shrink-0"></span>
              }
              <div class="min-w-0">
                <p class="font-semibold text-sm leading-snug line-clamp-2">{{ payload().name }}</p>
                <p class="text-xs text-base-content/60">{{ payload().type }}</p>
              </div>
            </div>

            @if (isForbidden()) {
              <div class="alert alert-warning py-2 text-xs">
                <span>{{ i18n.t('decklist.feedback.forbidden') }}</span>
              </div>
            } @else {
              <label class="form-control w-full">
                <span class="label py-0 mb-1">
                  <span class="label-text font-medium">{{ i18n.t('decklist.dialog.selectDeck') }}</span>
                </span>
                <select
                  class="select select-bordered select-sm w-full"
                  [ngModel]="selectedDeckId()"
                  (ngModelChange)="onDeckChange($event)"
                >
                  @for (deck of decklistStore.decklists(); track deck.id) {
                    <option [ngValue]="deck.id">{{ deck.name }}</option>
                  }
                </select>
              </label>

              <div class="rounded-lg border border-base-300 border-dashed p-3 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/60">{{ i18n.t('decklist.dialog.inDeck') }}</span>
                  <span class="font-medium tabular-nums">
                    {{ inDeckQty() }} / {{ maxCopies() }}
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/60">{{ i18n.t('decklist.dialog.canAdd') }}</span>
                  <span class="font-medium tabular-nums text-primary">{{ remaining() }}</span>
                </div>
              </div>

              <div>
                <span class="label-text font-medium text-sm">{{ i18n.t('decklist.dialog.quantity') }}</span>
                <div class="flex flex-wrap items-center gap-2 mt-2">
                  @for (preset of quantityPresets(); track preset) {
                    <button
                      type="button"
                      class="btn btn-sm"
                      [class.btn-primary]="quantity() === preset"
                      [class.btn-outline]="quantity() !== preset"
                      [disabled]="preset > remaining()"
                      (click)="quantity.set(preset)"
                    >
                      ×{{ preset }}
                    </button>
                  }
                  <button
                    type="button"
                    class="btn btn-sm btn-outline"
                    [disabled]="remaining() <= 0"
                    (click)="quantity.set(remaining())"
                  >
                    {{ i18n.t('decklist.dialog.max') }}
                  </button>
                </div>
                <input
                  type="number"
                  min="1"
                  [max]="remaining()"
                  class="input input-bordered input-sm w-full mt-2"
                  [ngModel]="quantity()"
                  (ngModelChange)="onQuantityInput($event)"
                />
              </div>

              @if (showNewDeck()) {
                <div class="flex gap-2">
                  <input
                    type="text"
                    class="input input-bordered input-sm flex-1"
                    [placeholder]="i18n.t('decklist.dialog.newDeckPlaceholder')"
                    [ngModel]="newDeckName()"
                    (ngModelChange)="newDeckName.set($event)"
                    (keydown.enter)="createAndSelectDeck()"
                  />
                  <button type="button" class="btn btn-primary btn-sm" (click)="createAndSelectDeck()">
                    {{ i18n.t('decklist.dialog.create') }}
                  </button>
                </div>
              } @else {
                <button type="button" class="btn btn-ghost btn-sm w-full" (click)="showNewDeck.set(true)">
                  + {{ i18n.t('decklist.dialog.newDeck') }}
                </button>
              }
            }
          </div>

          <div class="modal-action px-4 pb-4 pt-0 mt-0">
            <button type="button" class="btn btn-ghost btn-sm" (click)="closeDialog()">
              {{ i18n.t('decklist.dialog.cancel') }}
            </button>
            @if (!isForbidden()) {
              <button
                type="button"
                class="btn btn-primary btn-sm"
                [disabled]="!canConfirm()"
                (click)="confirmAdd()"
              >
                {{ i18n.t('decklist.dialog.confirm') }}
              </button>
            }
          </div>
        </div>
        <div class="modal-backdrop bg-black/50" (click)="closeDialog()"></div>
      </div>
    }
  `,
})
export class AddToDecklistButtonComponent {
  readonly payload = input.required<AddToDecklistPayload>();
  readonly banlistStatus = input<BanlistStatus | null>(null);

  protected readonly decklistStore = inject(DecklistStore);
  protected readonly i18n = inject(I18nService);

  readonly dialogOpen = signal(false);
  readonly selectedDeckId = signal('');
  readonly quantity = signal(1);
  readonly newDeckName = signal('');
  readonly showNewDeck = signal(false);

  readonly maxCopies = computed(() => this.decklistStore.maxCopies(this.banlistStatus()));
  readonly inDeckQty = computed(() =>
    this.selectedDeckId()
      ? this.decklistStore.quantityInDeck(this.selectedDeckId(), this.payload().id)
      : 0,
  );
  readonly remaining = computed(() =>
    this.selectedDeckId()
      ? this.decklistStore.remainingCopies(this.selectedDeckId(), this.payload().id, this.banlistStatus())
      : 0,
  );

  quantityPresets(): number[] {
    const max = this.remaining();
    return [1, 2, 3].filter((n) => n <= max || max === 0);
  }

  isForbidden(): boolean {
    return this.decklistStore.maxCopies(this.banlistStatus()) === 0;
  }

  canConfirm(): boolean {
    return this.remaining() > 0 && this.quantity() >= 1 && this.quantity() <= this.remaining();
  }

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
    const activeId = this.decklistStore.activeDecklistId() ?? this.decklistStore.decklists()[0]?.id ?? '';
    this.selectedDeckId.set(activeId);
    const rem = this.decklistStore.remainingCopies(activeId, this.payload().id, this.banlistStatus());
    this.quantity.set(rem > 0 ? 1 : 1);
    this.newDeckName.set('');
    this.showNewDeck.set(false);
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onDeckChange(deckId: string): void {
    this.selectedDeckId.set(deckId);
    const rem = this.remaining();
    if (this.quantity() > rem) {
      this.quantity.set(Math.max(1, rem));
    }
  }

  onQuantityInput(value: number | string): void {
    const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
    if (!Number.isFinite(parsed)) {
      return;
    }
    this.quantity.set(Math.min(Math.max(1, parsed), Math.max(1, this.remaining())));
  }

  createAndSelectDeck(): void {
    const name = this.newDeckName().trim();
    if (!name) {
      return;
    }
    const id = this.decklistStore.createDecklist(name);
    this.selectedDeckId.set(id);
    this.showNewDeck.set(false);
    this.newDeckName.set('');
    this.quantity.set(1);
  }

  confirmAdd(): void {
    const ok = this.decklistStore.addCardToDeck(
      this.selectedDeckId(),
      { ...this.payload(), banlistStatus: this.banlistStatus() },
      this.quantity(),
    );
    if (ok) {
      this.closeDialog();
    }
  }
}
