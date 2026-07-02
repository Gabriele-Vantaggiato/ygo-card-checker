import { Component, inject } from '@angular/core';
import { CardSearchComponent } from '../../components/card-search/card-search.component';
import { FormatSelectorComponent } from '../../components/format-selector/format-selector.component';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle.component';
import { LegalityResultComponent } from '../../components/legality-result/legality-result.component';
import { SearchHistoryComponent } from '../../components/search-history/search-history.component';
import { I18nService } from '../../services/i18n.service';
import { CheckerStore } from '../../stores/checker.store';

@Component({
  selector: 'app-checker-page',
  standalone: true,
  imports: [
    LanguageToggleComponent,
    FormatSelectorComponent,
    CardSearchComponent,
    LegalityResultComponent,
    SearchHistoryComponent,
  ],
  providers: [CheckerStore],
  template: `
    <div class="min-h-screen bg-base-200">
      <div class="navbar bg-base-100 shadow-sm px-4">
        <div class="flex-1">
          <span class="text-xl font-bold">{{ i18n.t('app.title') }}</span>
        </div>
        <app-language-toggle />
      </div>

      <main class="container mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-4 sm:space-y-6 lg:max-w-7xl">
        <p class="text-base-content/70 text-center lg:text-left text-sm sm:text-base">
          {{ i18n.t('app.subtitle') }}
        </p>

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

              <div class="hidden lg:block border-t border-base-300 pt-4 lg:mt-auto lg:shrink-0">
                <app-search-history
                  [pinned]="true"
                  [entries]="store.searchHistory()"
                  [selectedCardId]="store.selectedCard()?.id ?? null"
                  [formatId]="store.selectedFormatId()"
                  (cardSelected)="store.selectFromHistory($event)"
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
          </section>
        </div>

        <div class="lg:hidden">
          <app-search-history
            [entries]="store.searchHistory()"
            [selectedCardId]="store.selectedCard()?.id ?? null"
            [formatId]="store.selectedFormatId()"
            (cardSelected)="store.selectFromHistory($event)"
            (clear)="store.clearSearchHistory()"
          />
        </div>
      </main>
    </div>
  `,
})
export class CheckerPage {
  protected readonly store = inject(CheckerStore);
  protected readonly i18n = inject(I18nService);
}
