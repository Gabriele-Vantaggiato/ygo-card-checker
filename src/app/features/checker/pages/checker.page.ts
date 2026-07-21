import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { CardSearchComponent } from '../../../components/card-search/card-search.component';
import { CardDetailTabsComponent } from '../../../components/card-detail-tabs/card-detail-tabs.component';
import { FormatSelectorComponent } from '../../../components/format-selector/format-selector.component';
import { SearchHistoryComponent } from '../../../components/search-history/search-history.component';
import { I18nService } from '../../../services/i18n.service';
import { CheckerStore } from '../stores/checker.store';
import { DecklistStore } from '../../decklist/stores/decklist.store';

interface DeckReturnContext {
  deckId: string;
  deckName: string;
  cardId: number;
}

import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { YgoCard } from '../../../models/ygo-card.model';
import { SearchHistoryEntry } from '../../../models/search-history.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-checker-page',
  standalone: true,
  imports: [
    FormatSelectorComponent,
    CardSearchComponent,
    CardDetailTabsComponent,
    SearchHistoryComponent,
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

      @if (store.selectedCard(); as selected) {
        <div class="checker-mobile-jump lg:hidden">
          <button type="button" class="btn btn-ghost btn-xs" (click)="scrollToSearch()">
            {{ 'checker.jumpSearch' | translate }}
          </button>
          <span class="checker-mobile-jump-name">{{ selected.name }}</span>
          <button type="button" class="btn btn-ghost btn-xs" (click)="scrollToDetail()">
            {{ 'checker.jumpResult' | translate }}
          </button>
        </div>
      }

      <div
        class="checker-layout"
        [class.checker-has-selection]="!!store.selectedCard()"
        [class.checker-is-searching]="isSearching()"
      >
        <aside #searchPane class="checker-sidebar fade-in-panel" id="checker-search">
          <div class="checker-sidebar-search">
            <app-card-search
              [query]="store.searchQuery()"
              [suggestions]="store.suggestions()"
              [suggestionLegality]="store.suggestionLegality()"
              [loading]="store.searchLoading()"
              [legalityLoading]="store.suggestionLegalityLoading()"
              [selectedCardId]="store.selectedCard()?.id ?? null"
              [selectedCard]="store.selectedCard()"
              (queryChange)="store.setSearchQuery($event)"
              (cardSelected)="onSearchCardSelected($event)"
            />
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
  private readonly searchPane = viewChild<ElementRef<HTMLElement>>('searchPane');
  private readonly detailPane = viewChild<ElementRef<HTMLElement>>('detailPane');

  readonly deckReturn = signal<DeckReturnContext | null>(null);

  constructor() {
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
        if (path !== '/' && path !== '') {
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
    queueMicrotask(() => this.scrollToDetail());
  }

  onHistoryCardSelected(entry: SearchHistoryEntry): void {
    this.store.selectFromHistory(entry);
    queueMicrotask(() => this.scrollToDetail());
  }

  scrollToSearch(): void {
    this.searchPane()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollToDetail(): void {
    this.detailPane()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
