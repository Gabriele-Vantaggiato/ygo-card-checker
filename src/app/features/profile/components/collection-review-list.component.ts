import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { CARD_CONDITIONS, CARD_LANGUAGES, CardCondition, CardLanguage, ScanQueueEntry } from '../../../models/collection.model';
import { displaySetCode } from '../../../utils/collection.utils';

export interface EntryPatch {
  tempId: string;
  patch: Partial<Pick<ScanQueueEntry, 'setCode' | 'rarity' | 'language' | 'condition' | 'firstEdition' | 'quantity' | 'notes'>>;
}

/** Editable rows of the scan queue. Pure presentation: all changes are emitted. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-collection-review-list',
  standalone: true,
  template: `
    <ul class="divide-y divide-base-300/60">
      @for (entry of entries(); track entry.tempId) {
        <li class="space-y-2 py-3">
          <div class="flex items-center gap-3">
            <img
              [src]="'https://images.ygoprodeck.com/images/cards_small/' + entry.passcode + '.jpg'"
              alt=""
              class="w-11 shrink-0 rounded"
              loading="lazy"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ entry.cardName }}</p>
              <p class="truncate text-xs text-base-content/60">{{ displaySet(entry.setCode) }} · {{ entry.rarity }}</p>
              @if (entry.needsReview) {
                <span class="badge badge-warning badge-sm mt-1">Da verificare</span>
              }
            </div>
            <div class="flex shrink-0 items-center">
              <button
                type="button"
                class="btn btn-ghost btn-square min-h-11 min-w-11"
                [attr.aria-label]="'Diminuisci quantità di ' + entry.cardName"
                [disabled]="entry.quantity <= 1"
                (click)="changeQuantity(entry, -1)"
              >
                −
              </button>
              <span class="w-6 text-center tabular-nums" aria-live="polite">{{ entry.quantity }}</span>
              <button
                type="button"
                class="btn btn-ghost btn-square min-h-11 min-w-11"
                [attr.aria-label]="'Aumenta quantità di ' + entry.cardName"
                (click)="changeQuantity(entry, 1)"
              >
                +
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 pl-[3.5rem]">
            <span class="text-sm text-base-content/60">{{ priceLabel(entry) }}</span>
            <div class="flex items-center">
              <button type="button" class="btn btn-ghost btn-sm min-h-11" [attr.aria-expanded]="openId() === entry.tempId" (click)="toggle(entry.tempId)">
                {{ openId() === entry.tempId ? 'Chiudi' : 'Dettagli' }}
              </button>
              <button type="button" class="btn btn-ghost btn-sm min-h-11 text-error" (click)="remove.emit(entry.tempId)">Rimuovi</button>
            </div>
          </div>

          @if (openId() === entry.tempId) {
            <div class="grid grid-cols-2 gap-2 pl-[3.5rem]">
              @if (entry.printings.length > 1) {
                <select
                  class="select select-bordered col-span-2 min-h-11 w-full"
                  (change)="pickPrinting(entry, selectValue($event))"
                  aria-label="Stampa"
                >
                  @for (p of entry.printings; track $index) {
                    <option [value]="p.set_code + '|' + p.set_rarity" [selected]="p.set_code + '|' + p.set_rarity === entry.setCode + '|' + entry.rarity">{{ p.set_code }} · {{ p.set_rarity }}</option>
                  }
                </select>
              }
              <select
                class="select select-bordered min-h-11 w-full"
                (change)="pickCondition(entry, selectValue($event))"
                aria-label="Condizione"
              >
                @for (c of conditions; track c) {
                  <option [value]="c" [selected]="c === entry.condition">{{ c }}</option>
                }
              </select>
              <select
                class="select select-bordered min-h-11 w-full"
                (change)="pickLanguage(entry, selectValue($event))"
                aria-label="Lingua"
              >
                @for (l of languages; track l) {
                  <option [value]="l" [selected]="l === entry.language">{{ l }}</option>
                }
              </select>
              <label class="col-span-2 flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  class="checkbox"
                  [checked]="entry.firstEdition"
                  (change)="patch.emit({ tempId: entry.tempId, patch: { firstEdition: checkedValue($event) } })"
                />
                <span class="text-sm">1st Edition</span>
              </label>
            </div>
          }
        </li>
      }
    </ul>
  `,
})
export class CollectionReviewListComponent {
  readonly entries = input.required<readonly ScanQueueEntry[]>();
  readonly prices = input.required<ReadonlyMap<number, number | null>>();
  readonly patch = output<EntryPatch>();
  readonly remove = output<string>();

  protected readonly conditions = CARD_CONDITIONS;
  protected readonly languages = CARD_LANGUAGES;
  protected readonly openId = signal<string | null>(null);

  private readonly eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

  protected toggle(tempId: string): void {
    this.openId.update((id) => (id === tempId ? null : tempId));
  }

  protected selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected checkedValue(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected readonly displaySet = displaySetCode;

  protected priceLabel(entry: ScanQueueEntry): string {
    const price = this.prices().get(entry.passcode);
    if (price === undefined) {
      return 'Prezzo in caricamento…';
    }
    return price === null ? 'Prezzo n/d' : this.eur.format(price);
  }

  protected changeQuantity(entry: ScanQueueEntry, delta: number): void {
    const quantity = Math.max(1, entry.quantity + delta);
    this.patch.emit({ tempId: entry.tempId, patch: { quantity } });
  }

  protected pickPrinting(entry: ScanQueueEntry, value: string): void {
    const [setCode, rarity] = value.split('|');
    this.patch.emit({ tempId: entry.tempId, patch: { setCode, rarity } });
  }

  protected pickCondition(entry: ScanQueueEntry, value: string): void {
    this.patch.emit({ tempId: entry.tempId, patch: { condition: value as CardCondition } });
  }

  protected pickLanguage(entry: ScanQueueEntry, value: string): void {
    this.patch.emit({ tempId: entry.tempId, patch: { language: value as CardLanguage } });
  }
}
