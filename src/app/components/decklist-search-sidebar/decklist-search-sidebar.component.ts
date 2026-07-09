import {
  ChangeDetectionStrategy,
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
import { FormatStore } from '../../core/stores/format.store';
import { sortYgoCardsByPlayability } from '../../utils/card-sort.utils';
import { maxCopiesForStatus } from '../../models/decklist.model';
import { CardSearchResultRowComponent } from '../card-search-result-row/card-search-result-row.component';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';
import { LoadingSkeletonComponent } from '../../shared/ui/loading-skeleton/loading-skeleton.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-search-sidebar',
  standalone: true,
  imports: [FormsModule, CardSearchResultRowComponent, TranslatePipe, DuelPanelComponent, LoadingSkeletonComponent],
  template: `
    <app-duel-panel panelClass="flex flex-col overflow-hidden min-w-0 w-full">
      <div class="duel-panel-header shrink-0">
        <input
          type="text"
          class="input input-bordered input-sm w-full"
          [placeholder]="'search.placeholder' | translate"
          [attr.aria-label]="'decklist.editor.search' | translate"
          [ngModel]="searchQuery()"
          (ngModelChange)="onSearchInput($event)"
        />
        @if (searchTotalRows() > 0) {
          <p class="text-[11px] text-base-content/50 mt-2 font-normal normal-case tracking-normal">
            {{ searchResultsLabel() }}
          </p>
        }
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
                class="btn btn-primary btn-xs btn-square shrink-0 mr-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100 transition-opacity"
                [class.btn-disabled]="row.isForbidden || !row.canAdd"
                [attr.aria-label]="'decklist.editor.quickAdd' | translate"
                (click)="onQuickAdd(row.card, $event)"
              >
                +
              </button>
            </div>
          } @empty {
            @if (searchQuery().trim().length >= 2) {
              <p class="text-xs text-base-content/60 px-2 py-4">{{ 'search.noResults' | translate }}</p>
            } @else {
              <p class="text-xs text-base-content/50 px-2 py-4">{{ 'decklist.editor.searchHint' | translate }}</p>
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
      const qtyInDeck = deckCards.find((c) => c.id === card.id)?.quantity ?? 0;
      const isForbidden = legality?.banlistStatus === 'Forbidden';
      const status = legality?.banlistStatus ?? 'Unlimited';
      const canAdd = !isForbidden && qtyInDeck < maxCopiesForStatus(status);
      return { card, legality, qtyInDeck, isForbidden, canAdd };
    });
  });

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

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.search$.next(value);
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

  onQuickAdd(card: YgoCard, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.cardInspect.emit(card);
    const row = this.enrichedSearchRows().find((item) => item.card.id === card.id);
    if (row?.canAdd) {
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
