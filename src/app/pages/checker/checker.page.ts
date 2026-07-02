import { Component, inject } from '@angular/core';
import { CardSearchComponent } from '../../components/card-search/card-search.component';
import { FormatSelectorComponent } from '../../components/format-selector/format-selector.component';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle.component';
import { LegalityResultComponent } from '../../components/legality-result/legality-result.component';
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

      <main class="container mx-auto max-w-2xl px-4 py-8 space-y-6">
        <p class="text-base-content/70 text-center">{{ i18n.t('app.subtitle') }}</p>

        <div class="card bg-base-100 shadow-xl border border-base-300 overflow-visible">
          <div class="card-body space-y-4 overflow-visible">
            <app-format-selector
              [formats]="store.formats()"
              [selectedId]="store.selectedFormatId()"
              (selectedChange)="store.setFormatId($event)"
            />

            <app-card-search
              [query]="store.searchQuery()"
              [suggestions]="store.suggestions()"
              [loading]="store.searchLoading()"
              (queryChange)="store.setSearchQuery($event)"
              (cardSelected)="store.selectCard($event)"
            />
          </div>
        </div>

        @if (store.error()) {
          <div class="alert alert-error">
            <span>{{ store.error() }}</span>
          </div>
        }

        <app-legality-result
          [card]="store.selectedCard()"
          [result]="store.legalityResult()"
          [format]="store.selectedFormat()"
        />
      </main>
    </div>
  `,
})
export class CheckerPage {
  protected readonly store = inject(CheckerStore);
  protected readonly i18n = inject(I18nService);
}
