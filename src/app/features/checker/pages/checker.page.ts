import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { CardSearchComponent } from '../../../components/card-search/card-search.component';
import { CardDetailTabsComponent } from '../../../components/card-detail-tabs/card-detail-tabs.component';
import { FormatSelectorComponent } from '../../../components/format-selector/format-selector.component';
import { SearchHistoryComponent } from '../../../components/search-history/search-history.component';
import { CardSearchFiltersPanelComponent } from '../../../shared/ui/card-search-filters-panel/card-search-filters-panel.component';
import { SearchToolbarComponent } from '../../../shared/ui/search-toolbar/search-toolbar.component';
import { I18nService } from '../../../services/i18n.service';
import { CheckerStore } from '../stores/checker.store';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { YgoCard } from '../../../models/ygo-card.model';
import { SearchHistoryEntry } from '../../../models/search-history.model';

interface DeckReturnContext {
  deckId: string;
  deckName: string;
  cardId: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-checker-page',
  standalone: true,
  imports: [
    FormatSelectorComponent,
    CardSearchComponent,
    CardDetailTabsComponent,
    SearchHistoryComponent,
    CardSearchFiltersPanelComponent,
    SearchToolbarComponent,
    TranslatePipe,
  ],
  providers: [CheckerStore],
  template: `
    <main class="page-main checker-page">
      <header class="checker-toolbar">
        <div class="checker-toolbar-copy min-w-0">
          <h1 class="checker-toolbar-title">{{ 'checker.pageTitle' | translate }}</h1>
          <p class="checker-toolbar-sub">{{ 'checker.pageSubtitle' | translate }}</p>
        </div>
        <div class="checker-toolbar-format sm:hidden">
          <app-format-selector
            [inline]="true"
            [showLabel]="false"
            [formats]="store.formats()"
            [selectedId]="store.selectedFormatId()"
            (selectedChange)="store.setFormatId($event)"
          />
        </div>
      </header>

      <div class="page-usage-note"><strong>{{ 'ux.searchGuide' | translate }}</strong><p>{{ 'ux.searchGuideHint' | translate }}</p></div>
      @if (deckReturn(); as ctx) {
        <div
          class="checker-deck-return"
          role="navigation"
          [attr.aria-label]="'search.backToDeck' | translate"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="badge badge-primary badge-sm shrink-0 hidden sm:inline-flex">{{
              'nav.decklist' | translate
            }}</span>
            <p class="text-sm min-w-0 truncate">
              <span class="font-semibold text-primary">{{ ctx.deckName }}</span>
              <span class="text-base-content/70 hidden sm:inline">
                · {{ 'search.fromDeckContext' | translate }}</span
              >
            </p>
          </div>
          <button
            type="button"
            class="btn btn-primary btn-sm shrink-0 gap-1.5"
            (click)="returnToDecklist()"
          >
            <span aria-hidden="true">←</span>
            {{ 'search.backToDeck' | translate }}
          </button>
        </div>
      }

      @if (store.error()) {
        <div class="alert alert-error alert-sm py-2">
          <span>{{ store.error() }}</span>
        </div>
      }

      <!-- Sticky scope spans search + detail so the bar stays for the whole page scroll. -->
      <div class="checker-sticky-search-scope">
        <div class="checker-sticky-search lg:hidden">
          <app-search-toolbar
            [query]="store.searchQuery()"
            [loading]="store.searchLoading() || store.suggestionLegalityLoading()"
            [filtersOpen]="store.filtersOpen()"
            [filterCount]="store.advancedFilterCount()"
            (queryChange)="store.setSearchQuery($event)"
            (search)="store.submitSearch()"
            (filtersToggle)="store.filtersOpen.set(!store.filtersOpen())"
          />
        </div>

        <div
          class="checker-layout"
          [class.checker-has-selection]="!!store.selectedCard()"
          [class.checker-is-searching]="isSearching()"
        >
          <aside class="checker-sidebar fade-in-panel" id="checker-search">
            <div class="checker-sidebar-search">
              <app-card-search
                [query]="store.searchQuery()"
                [suggestions]="store.suggestions()"
                [suggestionLegality]="store.suggestionLegality()"
                [loading]="store.searchLoading()"
                [legalityLoading]="store.suggestionLegalityLoading()"
                [selectedCardId]="store.selectedCard()?.id ?? null"
                [filtersOpen]="store.filtersOpen()"
                [filterCount]="store.advancedFilterCount()"
                (queryChange)="store.setSearchQuery($event)"
                (cardSelected)="onSearchCardSelected($event)"
                (search)="store.submitSearch()"
                (filtersToggle)="store.filtersOpen.set(!store.filtersOpen())"
              />
              @if (store.filtersOpen()) {
                <app-card-search-filters-panel
                  [filters]="store.advancedFilters()"
                  (filtersChange)="store.setAdvancedFilters($event)"
                  (close)="store.filtersOpen.set(false)"
                />
              }
            </div>

            <div class="checker-sidebar-history" [class.checker-history-dimmed]="isSearching()">
              <app-search-history
                #searchHistory
                [pinned]="true"
                [entries]="store.searchHistory()"
                [selectedCardId]="store.selectedCard()?.id ?? null"
                [formatId]="store.selectedFormatId()"
                [collapsed]="isSearching()"
                (cardSelected)="onHistoryCardSelected($event)"
                (remove)="store.removeSearchHistoryEntry($event)"
                (clear)="store.clearSearchHistory()"
              />
            </div>
          </aside>

          <section
            #detailPane
            id="checker-detail"
            class="checker-detail fade-in-panel"
          >
            <app-card-detail-tabs
              [card]="store.selectedCard()"
              [result]="store.legalityResult()"
              [format]="store.selectedFormat()"
              [historyEntries]="store.searchHistory()"
              [relatedLoading]="store.relatedLoading()"
              [relatedAvailable]="store.relatedAvailable()"
              [relatedSeries]="store.relatedSeries()"
              [relatedMentions]="store.relatedMentions()"
              [relatedEffects]="store.relatedEffects()"
              [relatedTags]="store.relatedTags()"
              [relatedGroups]="store.relatedGroups()"
              [relatedSuggestions]="store.relatedSuggestions()"
              (historyPick)="store.selectFromHistory($event)"
              (relatedCardSelect)="store.openRelatedCard($event)"
            />
          </section>
        </div>
      </div>
    </main>
  `,
})
export class CheckerPage {
  protected readonly store = inject(CheckerStore);
  protected readonly i18n = inject(I18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly decklistStore = inject(DecklistStore);

  private readonly searchHistoryPanel = viewChild<SearchHistoryComponent>('searchHistory');
  private readonly detailPane = viewChild<ElementRef<HTMLElement>>('detailPane');

  readonly deckReturn = signal<DeckReturnContext | null>(null);
  private readonly pendingDetailScroll = signal(false);

  constructor() {
    // Scroll after Angular has committed the selected card + legality DOM (incl. .card-art-frame).
    afterRenderEffect(() => {
      if (!this.pendingDetailScroll()) {
        return;
      }
      const card = this.store.selectedCard();
      const result = this.store.legalityResult();
      if (!card || !result) {
        return;
      }

      untracked(() => {
        this.pendingDetailScroll.set(false);
        this.scrollToDetail();
      });
    });

    this.route.queryParamMap
      .pipe(
        map((params) => ({
          cardId: params.get('cardId'),
          from: params.get('from'),
          deckId: params.get('deckId'),
        })),
        filter(({ cardId }) => !!cardId && /^\d+$/.test(cardId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ cardId, from, deckId }) => {
        const numericCardId = Number(cardId);
        this.store.openCardById(numericCardId);
        this.pendingDetailScroll.set(true);

        if (from === 'decklist' && deckId) {
          const deck = this.decklistStore.getDeckById(deckId);
          if (deck) {
            this.deckReturn.set({
              deckId,
              deckName: deck.name,
              cardId: numericCardId,
            });
          }
        }

        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { cardId: null, from: null, deckId: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        const path = event.urlAfterRedirects.split('?')[0];
        if (path !== '/search') {
          this.deckReturn.set(null);
        }
      });
  }

  isSearching(): boolean {
    return this.store.searchQuery().trim().length >= 2;
  }

  returnToDecklist(): void {
    const ctx = this.deckReturn();
    if (!ctx) {
      return;
    }
    const cardId = this.store.selectedCard()?.id ?? ctx.cardId;
    this.deckReturn.set(null);
    void this.router.navigate(['/decklist'], {
      queryParams: {
        deckId: ctx.deckId,
        cardId,
        editor: '1',
      },
    });
  }

  onSearchCardSelected(card: YgoCard): void {
    this.store.selectCard(card);
    this.searchHistoryPanel()?.collapse();
    this.pendingDetailScroll.set(true);
  }

  onHistoryCardSelected(entry: SearchHistoryEntry): void {
    this.store.selectFromHistory(entry);
    this.pendingDetailScroll.set(true);
  }

  scrollToDetail(): void {
    const detail = this.detailPane()?.nativeElement;
    if (!detail) {
      return;
    }

    const reduced = this.prefersReducedMotion();
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;

    if (!isMobile) {
      detail.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      return;
    }

    const target =
      (detail.querySelector('.card-art-frame') as HTMLElement | null) ?? detail;
    this.scrollElementToViewportCenter(target, reduced);
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private scrollElementToViewportCenter(el: HTMLElement, reducedMotion: boolean): void {
    const rect = el.getBoundingClientRect();
    const stickyTop = this.measureStickyTopOffset();
    const stickyBottom = this.measureStickyBottomOffset();
    const visibleHeight = Math.max(0, window.innerHeight - stickyTop - stickyBottom);
    const visibleCenter = stickyTop + visibleHeight / 2;
    const elementCenter = rect.top + rect.height / 2;
    const top = Math.max(0, window.scrollY + (elementCenter - visibleCenter));

    window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  private measureStickyTopOffset(): number {
    const searchToolbar = document.querySelector('.checker-sticky-search') as HTMLElement | null;
    if (searchToolbar) {
      const rect = searchToolbar.getBoundingClientRect();
      if (rect.height > 0 && rect.top < window.innerHeight * 0.35) {
        return Math.max(0, Math.round(rect.bottom));
      }
    }

    const navbar = document.querySelector('.studio-navbar') as HTMLElement | null;
    return navbar ? Math.max(0, Math.round(navbar.getBoundingClientRect().bottom)) : 64;
  }

  private measureStickyBottomOffset(): number {
    const tabBar = document.querySelector('.mobile-tab-bar') as HTMLElement | null;
    if (!tabBar) {
      return 0;
    }
    const rect = tabBar.getBoundingClientRect();
    return rect.height > 0 ? Math.max(0, Math.round(window.innerHeight - rect.top)) : 0;
  }
}
