import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { CARD_CONDITIONS, CARD_LANGUAGES, CardCondition, CardLanguage, CollectionItem } from '../../../models/collection.model';
import { AuthService } from '../../../services/auth.service';
import { CollectionPriceService } from '../../../services/collection-price.service';
import { CollectionService } from '../../../services/collection.service';
import { collectionTotals } from '../../../utils/collection.utils';
import { CollectionScannerComponent } from './collection-scanner.component';

const PAGE_SIZE = 60;

/** "Collezione" block of the profile: totals, filters, list with inline edit, scan entry point. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-collection-section',
  standalone: true,
  imports: [CollectionScannerComponent],
  template: `
    <section class="space-y-4 rounded-lg border border-base-300/60 p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 space-y-1">
          <h2 class="section-title">Collezione</h2>
          @if (collection.items().length > 0) {
            <p class="text-sm text-base-content/70">
              {{ totals().totalCards }} carte · {{ totals().uniqueCards }} uniche
              <span class="mx-1 text-base-content/30" aria-hidden="true">|</span>
              <span class="font-medium text-base-content" [title]="valueHint()">≈ {{ eur.format(totals().valueEur) }}</span>
            </p>
            <p class="text-xs text-base-content/50">
              Valore stimato su prezzi Cardmarket
              @if (totals().unpricedCards > 0) {
                · {{ totals().unpricedCards }} {{ totals().unpricedCards === 1 ? 'copia' : 'copie' }} senza prezzo
              }
            </p>
          }
        </div>
        @if (collection.items().length > 0) {
          <button type="button" class="btn btn-primary btn-sm min-h-11 shrink-0 sm:min-h-8" (click)="scanning.set(true)">Scansiona</button>
        }
      </div>

      @if (collection.status() === 'loading' && collection.items().length === 0) {
        <div class="flex justify-center py-8"><span class="loading loading-spinner" role="status" aria-label="Caricamento"></span></div>
      } @else if (collection.status() === 'error' && collection.items().length === 0) {
        <div class="flex flex-wrap items-center gap-2 text-sm text-error" role="alert">
          Impossibile caricare la collezione.
          <button type="button" class="btn btn-outline btn-sm min-h-11 sm:min-h-8" (click)="reload()">Riprova</button>
        </div>
      } @else {
          @if (collection.status() === 'error') {
            <div class="flex flex-wrap items-center gap-2 text-sm text-error" role="alert">
              Impossibile aggiornare la collezione.
              <button type="button" class="btn btn-outline btn-sm min-h-11 sm:min-h-8" (click)="reload()">Riprova</button>
            </div>
          }
          @if (collection.status() === 'offline') {
            <p class="text-xs text-base-content/60" role="status">Offline: le modifiche si sincronizzano appena torni online.</p>
          }

          @if (collection.items().length === 0) {
            <div class="empty-state py-10">
              <p class="empty-state-title">La tua collezione è vuota</p>
              <p class="empty-state-hint">Scansiona le tue carte con la fotocamera: riconosco set, rarità e valore.</p>
              <button type="button" class="btn btn-primary btn-sm mt-4 min-h-11 sm:min-h-8" (click)="scanning.set(true)">Scansiona la prima carta</button>
            </div>
          } @else {
            <div class="flex flex-wrap gap-2">
              <input
                class="input input-bordered input-sm min-h-11 min-w-40 flex-1 sm:min-h-8"
                type="search"
                placeholder="Cerca per nome"
                aria-label="Cerca per nome"
                [value]="query()"
                (input)="setQuery($any($event.target).value)"
              />
              <select class="select select-bordered select-sm min-h-11 sm:min-h-8" aria-label="Set" (change)="setSet($any($event.target).value)">
                <option value="" [selected]="setFilter() === ''">Tutti i set</option>
                @for (s of setOptions(); track s) {
                  <option [value]="s" [selected]="setFilter() === s">{{ s }}</option>
                }
              </select>
              <select class="select select-bordered select-sm min-h-11 sm:min-h-8" aria-label="Rarità" (change)="setRarity($any($event.target).value)">
                <option value="" [selected]="rarityFilter() === ''">Tutte le rarità</option>
                @for (r of rarityOptions(); track r) {
                  <option [value]="r" [selected]="rarityFilter() === r">{{ r }}</option>
                }
              </select>
              <select class="select select-bordered select-sm min-h-11 sm:min-h-8" aria-label="Condizione" (change)="setConditionFilter($any($event.target).value)">
                <option value="" [selected]="conditionFilter() === ''">Ogni condizione</option>
                @for (c of conditions; track c) {
                  <option [value]="c" [selected]="conditionFilter() === c">{{ c }}</option>
                }
              </select>
            </div>

            @if (filtered().length === 0) {
              <div class="space-y-2 py-6 text-center">
                <p class="text-sm text-base-content/60">Nessuna carta corrisponde ai filtri.</p>
                <button type="button" class="btn btn-ghost btn-sm min-h-11 sm:min-h-8" (click)="resetFilters()">Azzera filtri</button>
              </div>
            }

            <ul class="divide-y divide-base-300/60">
              @for (item of shown(); track item.id) {
                <li class="space-y-2 py-3">
                  <div class="flex items-center gap-3">
                    <img [src]="'https://images.ygoprodeck.com/images/cards_small/' + item.passcode + '.jpg'" alt="" class="w-10 shrink-0 rounded" loading="lazy" />
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-medium">{{ item.cardName }}</p>
                      <p class="truncate text-xs text-base-content/60">
                        {{ item.setCode }} · {{ item.rarity }}
                        <span class="text-base-content/45">· {{ item.language }} · {{ item.condition }}{{ item.firstEdition ? ' · 1st' : '' }}</span>
                      </p>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="text-sm tabular-nums">×{{ item.quantity }}</p>
                      <p class="text-xs text-base-content/60">{{ priceLabel(item) }}</p>
                      @if (item.quantity > 1 && unitPrice(item) !== null) {
                        <p class="text-xs text-base-content/45">{{ item.quantity }} � {{ eur.format(unitPrice(item)!) }}</p>
                      }
                    </div>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm min-h-11 shrink-0 sm:min-h-8"
                      [attr.aria-expanded]="editingId() === item.id"
                      [attr.aria-label]="(editingId() === item.id ? 'Chiudi modifica di ' : 'Modifica ') + item.cardName"
                      (click)="toggleEdit(item.id)"
                    >{{ editingId() === item.id ? 'Chiudi' : 'Modifica' }}</button>
                  </div>

                  @if (editingId() === item.id) {
                    <div class="grid grid-cols-2 items-center gap-2 pl-[3.25rem] sm:grid-cols-4">
                      <div class="flex items-center gap-1">
                        <button type="button" class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" aria-label="Meno" (click)="collection.update(item.id, { quantity: max1(item.quantity - 1) })">−</button>
                        <span class="w-6 text-center tabular-nums">{{ item.quantity }}</span>
                        <button type="button" class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" aria-label="Più" (click)="collection.update(item.id, { quantity: item.quantity + 1 })">+</button>
                      </div>
                      <select class="select select-bordered select-sm min-h-11 sm:min-h-8" aria-label="Condizione" (change)="setCondition(item, $any($event.target).value)">
                        @for (c of conditions; track c) {
                          <option [value]="c" [selected]="item.condition === c">{{ c }}</option>
                        }
                      </select>
                      <select class="select select-bordered select-sm min-h-11 sm:min-h-8" aria-label="Lingua" (change)="setLanguage(item, $any($event.target).value)">
                        @for (l of languages; track l) {
                          <option [value]="l" [selected]="item.language === l">{{ l }}</option>
                        }
                      </select>
                      <label class="flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-8">
                        <input type="checkbox" class="checkbox checkbox-sm" [checked]="item.firstEdition" (change)="collection.update(item.id, { firstEdition: $any($event.target).checked })" />
                        <span class="text-sm">1st Edition</span>
                      </label>
                      <input
                        class="input input-bordered input-sm col-span-2 min-h-11 sm:col-span-3 sm:min-h-8"
                        type="text"
                        placeholder="Note"
                        aria-label="Note"
                        [value]="item.notes ?? ''"
                        (change)="collection.update(item.id, { notes: $any($event.target).value.trim() || null })"
                      />
                      <button type="button" class="btn btn-ghost btn-sm min-h-11 justify-self-end text-error sm:min-h-8" (click)="remove(item)">Rimuovi</button>
                    </div>
                  }
                </li>
              }
            </ul>

            @if (filtered().length > shown().length) {
              <button type="button" class="btn btn-ghost btn-sm min-h-11 w-full sm:min-h-8" (click)="visible.set(visible() + PAGE_SIZE)">
                Mostra altre ({{ filtered().length - shown().length }})
              </button>
            }
          }
      }
    </section>

    @if (scanning()) {
      <app-collection-scanner (closed)="scanning.set(false)" />
    }
  `,
})
export class CollectionSectionComponent {
  protected readonly collection = inject(CollectionService);
  private readonly priceService = inject(CollectionPriceService);
  private readonly auth = inject(AuthService);

  protected readonly PAGE_SIZE = PAGE_SIZE;
  protected readonly conditions = CARD_CONDITIONS;
  protected readonly languages = CARD_LANGUAGES;
  protected readonly eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

  protected readonly scanning = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly visible = signal(PAGE_SIZE);
  protected readonly query = signal('');
  protected readonly setFilter = signal('');
  protected readonly rarityFilter = signal('');
  protected readonly conditionFilter = signal('');

  protected readonly totals = computed(() => collectionTotals(this.collection.items(), this.priceService.prices()));
  protected readonly valueHint = computed(() => {
    const unpriced = this.totals().unpricedCards;
    return `Stima Cardmarket (prezzo medio per carta)${unpriced ? `; ${unpriced} copie senza prezzo non incluse` : ''}`;
  });

  protected readonly setOptions = computed(() => [...new Set(this.collection.items().map((i) => i.setCode.split('-')[0]))].sort());
  protected readonly rarityOptions = computed(() => [...new Set(this.collection.items().map((i) => i.rarity))].sort());

  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    const set = this.setFilter();
    const rarity = this.rarityFilter();
    const condition = this.conditionFilter();
    return this.collection.items().filter(
      (i) =>
        (!query || i.cardName.toLowerCase().includes(query)) &&
        (!set || i.setCode.startsWith(`${set}-`)) &&
        (!rarity || i.rarity === rarity) &&
        (!condition || i.condition === condition),
    );
  });
  protected readonly shown = computed(() => this.filtered().slice(0, this.visible()));

  constructor() {
    // (Re)load whenever the signed-in user changes; load() is serialized and user-aware.
    this.auth.session$
      .pipe(
        map((s) => s?.user?.id ?? null),
        distinctUntilChanged(),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        this.editingId.set(null);
        void this.collection.load();
      });

    // Drop a set/rarity filter whose value no longer exists among the items.
    effect(() => {
      const sets = this.setOptions();
      const rarities = this.rarityOptions();
      untracked(() => {
        if (this.setFilter() && !sets.includes(this.setFilter())) {
          this.setFilter.set('');
        }
        if (this.rarityFilter() && !rarities.includes(this.rarityFilter())) {
          this.rarityFilter.set('');
        }
      });
    });

    // Keep prices in step with the items (scans, edits, reloads).
    effect(() => {
      const passcodes = this.collection.items().map((i) => i.passcode);
      untracked(() => void this.priceService.ensure(passcodes));
    });
  }

  protected async reload(): Promise<void> {
    await this.collection.load();
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    this.visible.set(PAGE_SIZE);
  }

  protected setSet(value: string): void {
    this.setFilter.set(value);
    this.visible.set(PAGE_SIZE);
  }

  protected setRarity(value: string): void {
    this.rarityFilter.set(value);
    this.visible.set(PAGE_SIZE);
  }

  protected setConditionFilter(value: string): void {
    this.conditionFilter.set(value);
    this.visible.set(PAGE_SIZE);
  }

  protected resetFilters(): void {
    this.query.set('');
    this.setFilter.set('');
    this.rarityFilter.set('');
    this.conditionFilter.set('');
    this.visible.set(PAGE_SIZE);
  }

  protected toggleEdit(id: string): void {
    this.editingId.set(this.editingId() === id ? null : id);
  }

  protected max1(value: number): number {
    return Math.max(1, value);
  }

  protected priceLabel(item: CollectionItem): string {
    const price = this.priceService.prices().get(item.passcode);
    return price == null ? 'n/d' : this.eur.format(price * item.quantity);
  }

  protected unitPrice(item: CollectionItem): number | null {
    return this.priceService.prices().get(item.passcode) ?? null;
  }

  protected setCondition(item: CollectionItem, value: string): void {
    void this.collection.update(item.id, { condition: value as CardCondition });
  }

  protected setLanguage(item: CollectionItem, value: string): void {
    void this.collection.update(item.id, { language: value as CardLanguage });
  }

  protected remove(item: CollectionItem): void {
    this.editingId.set(null);
    void this.collection.remove(item.id);
  }
}
