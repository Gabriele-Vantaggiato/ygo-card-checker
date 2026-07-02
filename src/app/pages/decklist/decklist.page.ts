import { Component, inject } from '@angular/core';
import { DecklistPanelComponent } from '../../components/decklist-panel/decklist-panel.component';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-decklist-page',
  standalone: true,
  imports: [DecklistPanelComponent],
  template: `
    <main class="container mx-auto max-w-[90rem] px-4 py-6 sm:py-8 flex-1">
      <header class="mb-6 space-y-1">
        <h1 class="text-2xl sm:text-3xl font-bold">{{ i18n.t('decklist.pageTitle') }}</h1>
        <p class="text-base-content/70 text-sm sm:text-base max-w-3xl">
          {{ i18n.t('decklist.pageSubtitle') }}
        </p>
      </header>

      <app-decklist-panel />
    </main>
  `,
})
export class DecklistPage {
  protected readonly i18n = inject(I18nService);
}
