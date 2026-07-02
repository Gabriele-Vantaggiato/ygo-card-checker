import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { CardRelatedPanelComponent } from '../../components/card-related-panel/card-related-panel.component';
import { CardSearchComponent } from '../../components/card-search/card-search.component';
import { FormatSelectorComponent } from '../../components/format-selector/format-selector.component';
import { LegalityResultComponent } from '../../components/legality-result/legality-result.component';
import { SearchHistoryComponent } from '../../components/search-history/search-history.component';
import { I18nService } from '../../services/i18n.service';
import { CheckerStore } from '../../stores/checker.store';
import { DecklistStore } from '../../stores/decklist.store';

interface DeckReturnContext {
  deckId: string;
  deckName: string;
  cardId: number;
}

@Component({
  selector: 'app-checker-page',
  standalone: true,
  imports: [
    FormatSelectorComponent,
    CardSearchComponent,
    LegalityResultComponent,
    SearchHistoryComponent,
    CardRelatedPanelComponent,
    RouterLink,
  ],
  providers: [CheckerStore],
  template: `
    <main class="container mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-4 sm:space-y-6 lg:max-w-7xl flex-1">
      @if (deckReturn(); as ctx) {
        <div
          class="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-2 sm:gap-3 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 sm:px-4 backdrop-blur-sm shadow-sm"
          role="navigation"
          [attr.aria-label]="i18n.t('search.backToDeck')"
        >
          <div class="min-w-0 flex items-center gap-2">
            <span class="badge badge-primary badge-sm shrink-0 hidden sm:inline-flex">{{ i18n.t('nav.decklist') }}</span>
            <p class="text-sm min-w-0 truncate">
              <span class="font-semibold text-primary">{{ ctx.deckName }}</span>
              <span class="text-base-content/70 hidden sm:inline"> · {{ i18n.t('search.fromDeckContext') }}</span>
            </p>
          </div>
          <button type="button" class="btn btn-primary btn-sm shrink-0 gap-1.5" (click)="returnToDecklist()">
            <span aria-hidden="true">←</span>
            {{ i18n.t('search.backToDeck') }}
          </button>
        </div>
      }

      <header class="space-y-1">
        <h1 class="text-2xl font-bold sr-only">{{ i18n.t('nav.search') }}</h1>
        <p class="text-base-content/70 text-center lg:text-left text-sm sm:text-base">
          {{ i18n.t('app.subtitle') }}
        </p>
      </header>

      @if (store.error()) {
        <div class="alert alert-error">
          <span>{{ store.error() }}</span>
        </div>
      }

      <div
        class="flex flex-col gap-4 sm:gap-6 lg:grid lg:grid-cols-[minmax(280px,340px)_1fr] xl:grid-cols-[minmax(300px,380px)_1fr] lg:gap-6 xl:gap-8 lg:items-start"
      >
        <aside
          class="card bg-base-100 shadow-xl border border-base-300 lg:sticky lg:top-16 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:overscroll-y-contain lg:flex lg:flex-col"
        >
          <div class="card-body space-y-4 lg:flex lg:flex-col lg:min-h-0 lg:flex-1 p-4 sm:p-6">
            <app-format-selector
              [formats]="store.formats()"
              [selectedId]="store.selectedFormatId()"
              (selectedChange)="store.setFormatId($event)"
            />

            <app-card-search
              [query]="store.searchQuery()"
              [suggestions]="store.suggestions()"
              [loading]="store.searchLoading()"
              [selectedCardId]="store.selectedCard()?.id ?? null"
              [selectedCard]="store.selectedCard()"
              (queryChange)="store.setSearchQuery($event)"
              (cardSelected)="store.selectCard($event)"
            />

            <div class="border-t border-base-300 pt-4 lg:mt-auto lg:shrink-0">
              <app-search-history
                [pinned]="true"
                [entries]="store.searchHistory()"
                [selectedCardId]="store.selectedCard()?.id ?? null"
                [formatId]="store.selectedFormatId()"
                (cardSelected)="store.selectFromHistory($event)"
                (remove)="store.removeSearchHistoryEntry($event)"
                (clear)="store.clearSearchHistory()"
              />
            </div>
          </div>
        </aside>

        <section
          class="min-w-0 w-full lg:sticky lg:top-16 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:overscroll-y-contain"
        >
          <app-legality-result
            [card]="store.selectedCard()"
            [result]="store.legalityResult()"
            [format]="store.selectedFormat()"
          />

          @if (store.selectedCard()) {
            <app-card-related-panel
              [loading]="store.relatedLoading()"
              [available]="store.relatedAvailable()"
              [series]="store.relatedSeries()"
              [mentions]="store.relatedMentions()"
              [effects]="store.relatedEffects()"
              [displayTags]="store.relatedTags()"
              [groups]="store.relatedGroups()"
              [suggestions]="store.relatedSuggestions()"
              (cardSelected)="store.openRelatedCard($event)"
            />

            <div class="mt-4 flex justify-end">
              <a
                routerLink="/combo"
                [queryParams]="{ cardId: store.selectedCard()!.id }"
                class="btn btn-outline btn-primary btn-sm gap-2"
              >
                {{ i18n.t('combo.openPage') }}
                <span aria-hidden="true">→</span>
              </a>
            </div>
          }
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
}
