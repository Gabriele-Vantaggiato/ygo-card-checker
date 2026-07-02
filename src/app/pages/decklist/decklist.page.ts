import { Component, inject } from '@angular/core';
import { DecklistPanelComponent } from '../../components/decklist-panel/decklist-panel.component';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-decklist-page',
  standalone: true,
  imports: [DecklistPanelComponent],
  template: `
    <main class="container mx-auto max-w-3xl px-4 py-6 sm:py-8 space-y-4 sm:space-y-6 flex-1">
      <header class="space-y-1">
        <h1 class="text-2xl font-bold">{{ i18n.t('decklist.pageTitle') }}</h1>
        <p class="text-base-content/70 text-sm sm:text-base">{{ i18n.t('decklist.pageSubtitle') }}</p>
      </header>

      <div class="card bg-base-100 shadow-xl border border-base-300">
        <div class="card-body p-4 sm:p-6">
          <app-decklist-panel [fullPage]="true" />
        </div>
      </div>
    </main>
  `,
})
export class DecklistPage {
  protected readonly i18n = inject(I18nService);
}
