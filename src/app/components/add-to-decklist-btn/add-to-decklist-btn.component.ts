import { Component, computed, effect, inject, input, signal } from '@angular/core';
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

    @if (dialogOpen()) {
      <div class="modal modal-open z-50">
        <div class="modal-box max-w-md p-0 overflow-hidden" (click)="$event.stopPropagation()">
          <div class="bg-gradient-to-br from-primary/10 to-base-200 px-4 py-4 border-b border-base-300">
            <h3 class="font-bold text-lg">{{ i18n.t('decklist.dialog.title') }}</h3>
            <p class="text-xs text-base-content/60 mt-0.5">{{ i18n.t('decklist.dialog.subtitle') }}</p>
          </div>

          <div class="p-4 space-y-4 max-h-[min(70vh,32rem)] overflow-y-auto">
            <div class="flex items-center gap-3 rounded-xl bg-base-200/60 p-3 border border-base-300">
              @if (payload().imageUrlSmall; as src) {
                <img [src]="src" [alt]="" class="w-12 h-[4.25rem] object-cover rounded-lg shadow shrink-0" />
              } @else {
                <span class="w-12 h-[4.25rem] rounded-lg bg-base-300 shrink-0"></span>
              }
              <div class="min-w-0">
                <p class="font-semibold text-sm leading-snug line-clamp-2">{{ payload().name }}</p>
                <p class="text-xs text-base-content/60 mt-0.5">{{ payload().type }}</p>
              </div>
            </div>

            @if (isForbidden()) {
              <div class="alert alert-warning py-2 text-xs">
                <span>{{ i18n.t('decklist.feedback.forbidden') }}</span>
              </div>
            } @else {
              <div>
                <p class="text-sm font-medium mb-2">{{ i18n.t('decklist.dialog.pickDeck') }}</p>
                <div class="space-y-2 max-h-36 overflow-y-auto pr-1">
                  @for (deck of decklistStore.decklists(); track deck.id) {
                    <button
                      type="button"
                      class="w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all"
                      [class.border-primary]="deck.id === selectedDeckId()"
                      [class.bg-primary/10]="deck.id === selectedDeckId()"
                      [class.shadow-sm]="deck.id === selectedDeckId()"
                      [class.border-base-300]="deck.id !== selectedDeckId()"
                      [class.bg-base-100]="deck.id !== selectedDeckId()"
                      (click)="selectDeck(deck.id)"
                    >
                      <div
                        class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg font-bold"
                        [class.bg-primary]="deck.id === selectedDeckId()"
                        [class.text-primary-content]="deck.id === selectedDeckId()"
                        [class.bg-base-300]="deck.id !== selectedDeckId()"
                      >
                        {{ deckInitial(deck.name) }}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="font-semibold text-sm truncate">{{ deck.name }}</p>
                        <p class="text-xs text-base-content/60">
                          {{ deckSummary(deck.id) }}
                        </p>
                      </div>
                      @if (cardQtyInDeck(deck.id) > 0) {
                        <span class="badge badge-sm badge-primary badge-outline shrink-0">
                          ×{{ cardQtyInDeck(deck.id) }}
                        </span>
                      }
                    </button>
                  }
                </div>
              </div>

              @if (selectedDeck()) {
                <label class="form-control w-full">
                  <span class="label py-0 mb-1">
                    <span class="label-text font-medium">{{ i18n.t('decklist.dialog.renameDeck') }}</span>
                  </span>
                  <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    [ngModel]="renameDraft()"
                    (ngModelChange)="renameDraft.set($event)"
                  />
                </label>

                <div class="rounded-xl border border-dashed border-base-300 bg-base-200/30 p-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p class="text-base-content/50">{{ i18n.t('decklist.dialog.inDeck') }}</p>
                    <p class="font-bold tabular-nums text-sm mt-0.5">{{ inDeckQty() }}/{{ maxCopies() }}</p>
                  </div>
                  <div>
                    <p class="text-base-content/50">{{ i18n.t('decklist.dialog.canAdd') }}</p>
                    <p class="font-bold tabular-nums text-sm mt-0.5 text-primary">{{ remaining() }}</p>
                  </div>
                  <div>
                    <p class="text-base-content/50">{{ i18n.t('decklist.dialog.deckTotal') }}</p>
                    <p class="font-bold tabular-nums text-sm mt-0.5">
                      {{ decklistStore.totalCardsForDeck(selectedDeckId()) }}
                    </p>
                  </div>
                </div>

                <div>
                  <p class="text-sm font-medium mb-2">{{ i18n.t('decklist.dialog.quantity') }}</p>
                  <div class="flex flex-wrap gap-2">
                    @for (preset of quantityPresets(); track preset) {
                      <button
                        type="button"
                        class="btn btn-sm min-w-12"
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
                </div>
              }

              @if (showNewDeck()) {
                <div class="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <p class="text-sm font-medium">{{ i18n.t('decklist.dialog.newDeck') }}</p>
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
                </div>
              } @else {
                <button type="button" class="btn btn-ghost btn-sm w-full" (click)="showNewDeck.set(true)">
                  + {{ i18n.t('decklist.dialog.newDeck') }}
                </button>
              }
            }
          </div>

          <div class="flex gap-2 justify-end px-4 py-4 border-t border-base-300 bg-base-100">
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
  readonly size = input<'sm' | 'md'>('sm');

  protected readonly decklistStore = inject(DecklistStore);
  protected readonly i18n = inject(I18nService);

  readonly dialogOpen = signal(false);
  readonly selectedDeckId = signal('');
  readonly quantity = signal(1);
  readonly newDeckName = signal('');
  readonly renameDraft = signal('');
  readonly showNewDeck = signal(false);

  readonly selectedDeck = computed(() => this.decklistStore.getDeckById(this.selectedDeckId()));
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

  constructor() {
    effect(() => {
      const deck = this.decklistStore.getDeckById(this.selectedDeckId());
      if (deck) {
        this.renameDraft.set(deck.name);
      }
    });
  }

  quantityPresets(): number[] {
    const rem = this.remaining();
    return [1, 2, 3].filter((n) => n <= rem);
  }

  isForbidden(): boolean {
    return this.decklistStore.maxCopies(this.banlistStatus()) === 0;
  }

  canConfirm(): boolean {
    return (
      this.renameDraft().trim().length > 0 &&
      this.remaining() > 0 &&
      this.quantity() >= 1 &&
      this.quantity() <= this.remaining()
    );
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

  deckInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  deckSummary(deckId: string): string {
    return this.i18n.t('decklist.deckCardCount', {
      total: `${this.decklistStore.totalCardsForDeck(deckId)}`,
      unique: `${this.decklistStore.uniqueCardsForDeck(deckId)}`,
    });
  }

  cardQtyInDeck(deckId: string): number {
    return this.decklistStore.quantityInDeck(deckId, this.payload().id);
  }

  openDialog(event: Event): void {
    event.stopPropagation();
    const activeId = this.decklistStore.activeDecklistId() ?? this.decklistStore.decklists()[0]?.id ?? '';
    this.selectDeck(activeId);
    this.newDeckName.set('');
    this.showNewDeck.set(false);
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  selectDeck(deckId: string): void {
    this.selectedDeckId.set(deckId);
    const deck = this.decklistStore.getDeckById(deckId);
    this.renameDraft.set(deck?.name ?? '');
    const rem = this.decklistStore.remainingCopies(deckId, this.payload().id, this.banlistStatus());
    this.quantity.set(rem > 0 ? Math.min(1, rem) : 1);
  }

  createAndSelectDeck(): void {
    const name = this.newDeckName().trim();
    if (!name) {
      return;
    }
    const id = this.decklistStore.createDecklist(name);
    this.selectDeck(id);
    this.showNewDeck.set(false);
    this.newDeckName.set('');
  }

  confirmAdd(): void {
    const deckId = this.selectedDeckId();
    const renamed = this.renameDraft().trim();
    const deck = this.decklistStore.getDeckById(deckId);
    if (renamed && deck && renamed !== deck.name) {
      this.decklistStore.renameDecklist(deckId, renamed);
    }

    const ok = this.decklistStore.addCardToDeck(
      deckId,
      { ...this.payload(), banlistStatus: this.banlistStatus() },
      this.quantity(),
    );
    if (ok) {
      this.closeDialog();
    }
  }
}
