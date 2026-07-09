import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
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
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { ContextPanelComponent } from '../../../shared/ui/context-panel/context-panel.component';
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
    PageHeaderComponent,
    ContextPanelComponent,
  ],
  providers: [CheckerStore],
  template: `
    <main class="page-main page-stack lg:max-w-7xl">
      <app-page-header
        titleKey="checker.pageTitle"
        subtitleKey="checker.pageSubtitle"
      />

      @if (deckReturn(); as ctx) {
        <div
          class="sticky top-14 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 sm:px-4 backdrop-blur-sm"
          role="navigation"
          [attr.aria-label]="'search.backToDeck' | translate"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="badge badge-primary badge-sm shrink-0 hidden sm:inline-flex">{{ 'nav.decklist' | translate }}</span>
            <p class="text-sm min-w-0 truncate">
              <span class="font-semibold text-primary">{{ ctx.deckName }}</span>
              <span class="text-base-content/70 hidden sm:inline"> · {{ 'search.fromDeckContext' | translate }}</span>
            </p>
          </div>
          <button type="button" class="btn btn-primary btn-sm shrink-0 gap-1.5" (click)="returnToDecklist()">
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

      <div class="sm:hidden deck-context-bar">
        <app-format-selector
          [inline]="true"
          [showLabel]="true"
          [formats]="store.formats()"
          [selectedId]="store.selectedFormatId()"
          (selectedChange)="store.setFormatId($event)"
        />
      </div>

      <div class="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <app-context-panel>
          <div class="context-panel-section">
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

          <div class="context-panel-section">
            <app-search-history
              #searchHistory
              [pinned]="true"
              [entries]="store.searchHistory()"
              [selectedCardId]="store.selectedCard()?.id ?? null"
              [formatId]="store.selectedFormatId()"
              (cardSelected)="onHistoryCardSelected($event)"
              (remove)="store.removeSearchHistoryEntry($event)"
              (clear)="store.clearSearchHistory()"
            />
          </div>
        </app-context-panel>

        <section
          class="min-w-0 space-y-4 lg:sticky lg:top-[3.75rem] lg:max-h-[calc(100vh-4.5rem)] lg:overflow-y-auto lg:overscroll-y-contain fade-in-panel"
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
  }

  onHistoryCardSelected(entry: SearchHistoryEntry): void {
    this.store.selectFromHistory(entry);
  }
}
