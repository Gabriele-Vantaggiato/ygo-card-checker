import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  viewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, Subscription, of, timer } from 'rxjs';
import { distinctUntilChanged, switchMap, tap, takeUntil, skip } from 'rxjs/operators';
import { DecklistCard } from '../../models/decklist.model';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { AdvancedCardSearchFilters, hasActiveAdvancedFilters } from '../../models/card-search-filters.model';
import { CardSearchFacade } from '../../services/card-search.facade';
import { I18nService } from '../../services/i18n.service';
import { FormatStore } from '../../core/stores/format.store';
import { sortYgoCardsByPlayability } from '../../utils/card-sort.utils';
import { maxCopiesForStatus } from '../../models/decklist.model';
import { CardSearchResultRowComponent } from '../card-search-result-row/card-search-result-row.component';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';
import { LoadingSkeletonComponent } from '../../shared/ui/loading-skeleton/loading-skeleton.component';
import { CardSearchFiltersPanelComponent } from '../../shared/ui/card-search-filters-panel/card-search-filters-panel.component';
import { SearchToolbarComponent } from '../../shared/ui/search-toolbar/search-toolbar.component';

type SearchTrigger = 'live' | 'submit';
const LIVE_TYPE_DEBOUNCE_MS = 280;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-search-sidebar',
  standalone: true,
  imports: [CardSearchResultRowComponent, TranslatePipe, DuelPanelComponent, LoadingSkeletonComponent, CardSearchFiltersPanelComponent, SearchToolbarComponent],
  template: `
    <app-duel-panel panelClass="flex flex-col overflow-hidden min-w-0 w-full">
      <div class="duel-panel-header shrink-0">
        <label class="block mb-2 text-sm font-semibold normal-case tracking-normal">{{ 'ux.addCards' | translate }}</label>
        <app-search-toolbar
          [query]="searchQuery()"
          [loading]="searchLoading()"
          [filtersOpen]="filtersOpen()"
          [filterCount]="advancedFilterCount()"
          (queryChange)="onSearchInput($event)"
          (search)="submitSearch()"
          (filtersToggle)="filtersOpen.set(!filtersOpen())"
        />
        @if (filtersOpen()) {
          <app-card-search-filters-panel
            [filters]="advancedFilters()"
            (filtersChange)="setAdvancedFilters($event)"
            (close)="filtersOpen.set(false)"
          />
        }
        @if (searchTotalRows() > 0) {
          <p class="text-[11px] text-base-content/50 mt-2 font-normal normal-case tracking-normal">
            {{ searchResultsLabel() }}
          </p>
        }
        <p class="mt-2 text-xs font-normal normal-case tracking-normal text-base-content/60">{{ 'ux.searchAddHint' | translate }}</p>
      </div>

      <div class="overflow-y-auto overscroll-y-contain p-2 min-h-[14rem] max-h-[min(62vh,30rem)] lg:max-h-[min(28vh,14rem)]">
        @if (searchLoading() || legalityLoading()) {
          <app-loading-skeleton [rows]="4" rowClass="h-10 w-full" />
        } @else {
          @for (row of enrichedSearchRows(); track row.card.id) {
            <div class="group flex items-center gap-1 rounded-lg">
              <app-card-search-result-row
                class="flex-1 min-w-0"
                [card]="row.card"
                [legality]="row.legality"
                [legalityLoading]="legalityLoading()"
                [active]="inspectedCardId() === row.card.id"
                [qtyInDeck]="row.qtyInDeck"
                [compact]="true"
                (cardSelect)="cardInspect.emit($event)"
              />
              <button
                type="button"
                class="btn btn-outline btn-sm btn-square shrink-0 mr-1"
                [disabled]="row.isForbidden || !row.canAdd || legalityLoading()"
                [attr.aria-label]="'decklist.editor.quickAdd' | translate"
                (click)="onQuickAdd(row.card, $event)"
              >
                +
              </button>
            </div>
          } @empty {
            @if (!searchLoading()) {
              <p class="text-xs text-base-content/60 px-2 py-4">{{ 'search.noResults' | translate }}</p>
            }
          }
        }
        @if (searchHasMore() && !searchLoading() && !legalityLoading()) {
          <button type="button" class="btn btn-ghost btn-sm w-full mt-2" (click)="loadMore()">
            {{ 'decklist.editor.loadMore' | translate }}
          </button>
        }
      </div>
    </app-duel-panel>
  `,
})
export class DecklistSearchSidebarComponent {
  private readonly toolbar = viewChild(SearchToolbarComponent);
  focusSearch(): void {
    this.toolbar()?.focusInput();
  }
  readonly deckCards = input.required<readonly DecklistCard[]>();
  readonly inspectedCardId = input<number | null>(null);

  readonly cardInspect = output<YgoCard>();
  readonly quickAdd = output<YgoCard>();

  protected readonly i18n = inject(I18nService);
  private readonly cardSearch = inject(CardSearchFacade);
  private readonly formatStore = inject(FormatStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly trigger$ = new Subject<SearchTrigger>();
  private readonly searchLimit = 50;
  private searchLegalitySub: Subscription | null = null;
  private lastMode: SearchTrigger = 'submit';

  readonly searchQuery = signal('');
  readonly advancedFilters = signal<AdvancedCardSearchFilters>({});
  readonly advancedFilterCount = computed(() => Object.keys(this.advancedFilters()).length);
  readonly filtersOpen = signal(false);
  readonly searchResults = signal<YgoCard[]>([]);
  readonly searchTotalRows = signal(0);
  readonly searchHasMore = signal(false);
  readonly searchLoading = signal(false);
  readonly legalityLoading = signal(false);
  readonly searchLegality = signal<Map<number, LegalityResult>>(new Map());

  readonly sortedSearchResults = computed(() =>
    sortYgoCardsByPlayability(this.searchResults(), this.searchLegality()),
  );

  readonly searchResultsLabel = computed(() =>
    this.i18n.t('decklist.editor.resultsCount', {
      shown: `${this.searchResults().length}`,
      total: `${this.searchTotalRows()}`,
    }),
  );

  readonly enrichedSearchRows = computed(() => {
    const legalityMap = this.searchLegality();
    const deckCards = this.deckCards();
    return this.sortedSearchResults().map((card) => {
      const legality = legalityMap.get(card.id) ?? null;
      const qtyInDeck = deckCards.filter((c) => c.id === card.id).reduce((total, c) => total + c.quantity, 0);
      const isForbidden = legality?.banlistStatus === 'Forbidden';
      const status = legality?.banlistStatus ?? 'Unlimited';
      const canAdd = !isForbidden && qtyInDeck < maxCopiesForStatus(status);
      return { card, legality, qtyInDeck, isForbidden, canAdd };
    });
  });

  constructor() {
    this.trigger$
      .pipe(
        tap((mode) => {
          this.lastMode = mode;
          this.searchLegalitySub?.unsubscribe();
          this.legalityLoading.set(false);
          this.searchLegality.set(new Map());
          this.searchResults.set([]);
          this.searchHasMore.set(false);
          this.searchTotalRows.set(0);
          this.searchLoading.set(true);
        }),
        switchMap((mode) => {
          const delay$: Observable<unknown> = mode === 'live' ? timer(LIVE_TYPE_DEBOUNCE_MS) : of(null);
          return delay$.pipe(switchMap(() => this.currentSearch$(0, mode)));
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

    this.i18n.lang$.pipe(skip(1), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.trigger$.next('submit'));

    this.destroyRef.onDestroy(() => this.searchLegalitySub?.unsubscribe());

    this.formatStore.formatId$
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const format = this.formatStore.selectedFormat();
        const cards = this.searchResults();
        if (format && cards.length > 0) {
          this.evaluateLegality(cards, format);
        }
      });

    // Default browse list on init, and refreshed on format switch while idle (no query/filters).
    this.formatStore.selectedFormat$
      .pipe(
        distinctUntilChanged((a, b) => a?.id === b?.id),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((format) => {
        if (format && !this.hasQueryOrFilters()) {
          this.trigger$.next('submit');
        }
      });
  }

  private hasQueryOrFilters(): boolean {
    return this.searchQuery().trim().length > 0 || hasActiveAdvancedFilters(this.advancedFilters());
  }

  private currentSearch$(offset: number, mode: SearchTrigger) {
    const query = this.searchQuery().trim();
    const filters = this.advancedFilters();
    const active = query.length > 0 || hasActiveAdvancedFilters(filters);
    if (!active) {
      const formatId = this.formatStore.selectedFormat()?.id;
      if (!formatId) {
        return of({ cards: [] as YgoCard[], totalRows: 0, hasMore: false });
      }
      return this.cardSearch.browseFormat$(formatId, this.i18n.lang(), this.searchLimit, offset);
    }
    if (mode === 'live') {
      return this.cardSearch.searchByName$(query, filters, this.i18n.lang(), this.searchLimit, offset);
    }
    return this.cardSearch.searchCombined$(query, filters, this.i18n.lang(), this.searchLimit, offset);
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.trigger$.next('live');
  }

  submitSearch(): void {
    this.trigger$.next('submit');
  }

  setAdvancedFilters(filters: AdvancedCardSearchFilters): void {
    this.advancedFilters.set(filters);
    this.trigger$.next('submit');
  }

  loadMore(): void {
    if (!this.searchHasMore() || this.searchLoading()) {
      return;
    }
    const offset = this.searchResults().length;
    const format = this.formatStore.selectedFormat();
    this.searchLoading.set(true);
    this.currentSearch$(offset, this.lastMode)
      .pipe(takeUntil(this.trigger$), takeUntilDestroyed(this.destroyRef))
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

  onQuickAdd(card: YgoCard, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const row = this.enrichedSearchRows().find((item) => item.card.id === card.id);
    if (row?.canAdd && !this.legalityLoading()) {
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
