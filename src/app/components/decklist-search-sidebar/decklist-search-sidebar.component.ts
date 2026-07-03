import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { DecklistCard } from '../../models/decklist.model';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { CardSearchFacade } from '../../services/card-search.facade';
import { I18nService } from '../../services/i18n.service';
import { FormatStore } from '../../stores/format.store';
import { sortYgoCardsByPlayability } from '../../utils/card-sort.utils';
import { maxCopiesForStatus } from '../../models/decklist.model';
import { CardSearchResultRowComponent } from '../card-search-result-row/card-search-result-row.component';

@Component({
  selector: 'app-decklist-search-sidebar',
  standalone: true,
  imports: [FormsModule, CardSearchResultRowComponent],
  template: `
    <aside class="duel-panel flex flex-col overflow-hidden min-w-0 w-full">
      <div class="duel-panel-header shrink-0 space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-base-content/60 mb-2">
          {{ i18n.t('decklist.editor.search') }}
        </p>
        <div class="flex gap-2">
          <input
            type="text"
            class="input input-bordered input-sm flex-1 min-w-0"
            [placeholder]="i18n.t('search.placeholder')"
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearchInput($event)"
          />
          <button type="button" class="btn btn-primary btn-sm" (click)="triggerSearch()">
            {{ i18n.t('decklist.editor.searchBtn') }}
          </button>
        </div>
        @if (searchTotalRows() > 0) {
          <p class="text-[11px] text-base-content/50 mt-2 px-0.5">
            {{ searchResultsLabel() }}
          </p>
        }
        <p class="text-[10px] text-base-content/45 mt-1 px-0.5">{{ i18n.t('decklist.editor.searchRowHint') }}</p>
      </div>

      <div class="overflow-y-auto overscroll-y-contain p-2 min-h-[10rem] max-h-[min(45vh,20rem)] lg:max-h-[min(28vh,14rem)]">
        @if (searchLoading() || legalityLoading()) {
          <p class="text-xs text-base-content/60 px-2 py-4">{{ i18n.t('search.loading') }}</p>
        } @else {
          @for (card of sortedSearchResults(); track card.id) {
            <div class="flex items-center gap-1 rounded-lg">
              <app-card-search-result-row
                class="flex-1 min-w-0"
                [card]="card"
                [legality]="legalityFor(card.id)"
                [legalityLoading]="legalityLoading()"
                [active]="inspectedCardId() === card.id"
                [qtyInDeck]="qtyInDeck(card.id)"
                (cardSelect)="cardInspect.emit($event)"
              />
              <button
                type="button"
                class="btn btn-primary btn-xs btn-square shrink-0 mr-1"
                [class.btn-disabled]="isForbidden(card.id) || !canAdd(card.id)"
                [attr.aria-label]="i18n.t('decklist.editor.quickAdd')"
                (click)="onQuickAdd(card, $event)"
              >
                +
              </button>
            </div>
          } @empty {
            @if (searchQuery().trim().length >= 2) {
              <p class="text-xs text-base-content/60 px-2 py-4">{{ i18n.t('search.noResults') }}</p>
            } @else {
              <p class="text-xs text-base-content/50 px-2 py-4">{{ i18n.t('decklist.editor.searchHint') }}</p>
            }
          }
        }
        @if (searchHasMore() && !searchLoading() && !legalityLoading()) {
          <button type="button" class="btn btn-ghost btn-sm w-full mt-2" (click)="loadMore()">
            {{ i18n.t('decklist.editor.loadMore') }}
          </button>
        }
      </div>
    </aside>
  `,
})
export class DecklistSearchSidebarComponent {
  readonly deckCards = input.required<readonly DecklistCard[]>();
  readonly inspectedCardId = input<number | null>(null);

  readonly cardInspect = output<YgoCard>();
  readonly quickAdd = output<YgoCard>();

  protected readonly i18n = inject(I18nService);
  private readonly cardSearch = inject(CardSearchFacade);
  private readonly formatStore = inject(FormatStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<string>();
  private readonly searchLimit = 50;
  private searchLegalitySub: Subscription | null = null;

  readonly searchQuery = signal('');
  readonly searchResults = signal<YgoCard[]>([]);
  readonly searchTotalRows = signal(0);
  readonly searchHasMore = signal(false);
  readonly searchLoading = signal(false);
  readonly legalityLoading = signal(false);
  readonly searchLegality = signal<Map<number, LegalityResult>>(new Map());

  readonly sortedSearchResults = computed(() =>
    sortYgoCardsByPlayability(this.searchResults(), this.searchLegality()),
  );

  constructor() {
    this.search$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmed = query.trim();
          if (trimmed.length < 2) {
            this.searchLoading.set(false);
            this.searchLegality.set(new Map());
            this.searchTotalRows.set(0);
            this.searchHasMore.set(false);
            return of({ cards: [] as YgoCard[], totalRows: 0, hasMore: false });
          }
          this.searchLoading.set(true);
          return this.cardSearch.searchPage$(trimmed, this.i18n.lang(), this.searchLimit, 0);
        }),
        tap(() => this.searchLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.searchResults.set(page.cards);
        this.searchTotalRows.set(page.totalRows);
        this.searchHasMore.set(page.hasMore);
        const format = this.formatStore.selectedFormat();
        if (format && page.cards.length > 0) {
          this.evaluateLegality(page.cards, format);
        } else {
          this.searchLegality.set(new Map());
        }
      });

    this.formatStore.formatId$
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const format = this.formatStore.selectedFormat();
        const cards = this.searchResults();
        if (format && cards.length > 0) {
          this.evaluateLegality(cards, format);
        }
      });
  }

  legalityFor(cardId: number): LegalityResult | null {
    return this.searchLegality().get(cardId) ?? null;
  }

  qtyInDeck(cardId: number): number {
    return this.deckCards().find((c) => c.id === cardId)?.quantity ?? 0;
  }

  isForbidden(cardId: number): boolean {
    return this.searchLegality().get(cardId)?.banlistStatus === 'Forbidden';
  }

  canAdd(cardId: number): boolean {
    if (this.isForbidden(cardId)) {
      return false;
    }
    const status = this.searchLegality().get(cardId)?.banlistStatus ?? 'Unlimited';
    return this.qtyInDeck(cardId) < maxCopiesForStatus(status);
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.search$.next(value);
  }

  triggerSearch(): void {
    this.search$.next(this.searchQuery());
  }

  loadMore(): void {
    const query = this.searchQuery().trim();
    if (query.length < 2 || !this.searchHasMore()) {
      return;
    }
    const offset = this.searchResults().length;
    const format = this.formatStore.selectedFormat();
    this.searchLoading.set(true);
    this.cardSearch
      .searchPage$(query, this.i18n.lang(), this.searchLimit, offset)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.searchResults.update((prev) => [...prev, ...page.cards]);
          this.searchTotalRows.set(page.totalRows);
          this.searchHasMore.set(page.hasMore);
          this.searchLoading.set(false);
          if (format && page.cards.length > 0) {
            this.evaluateLegality(page.cards, format, true);
          }
        },
        error: () => this.searchLoading.set(false),
      });
  }

  searchResultsLabel(): string {
    return this.i18n.t('decklist.editor.resultsCount', {
      shown: `${this.searchResults().length}`,
      total: `${this.searchTotalRows()}`,
    });
  }

  onQuickAdd(card: YgoCard, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.cardInspect.emit(card);
    if (this.canAdd(card.id)) {
      this.quickAdd.emit(card);
    }
  }

  private evaluateLegality(
    cards: YgoCard[],
    format: NonNullable<ReturnType<FormatStore['selectedFormat']>>,
    append = false,
  ): void {
    this.searchLegalitySub?.unsubscribe();
    this.legalityLoading.set(true);
    this.searchLegalitySub = this.cardSearch.evaluateLegality$(cards, format).subscribe({
      next: (map) => {
        if (append) {
          this.searchLegality.update((prev) => new Map([...prev, ...map]));
        } else {
          this.searchLegality.set(map);
        }
        this.legalityLoading.set(false);
      },
      error: () => {
        if (!append) {
          this.searchLegality.set(new Map());
        }
        this.legalityLoading.set(false);
      },
    });
  }
}
