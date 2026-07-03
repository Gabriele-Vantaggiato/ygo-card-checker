import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecklistPanelComponent } from '../../../components/decklist-panel/decklist-panel.component';
import { I18nService } from '../../../services/i18n.service';

import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-page',
  standalone: true,
  imports: [DecklistPanelComponent,
    TranslatePipe],
  template: `
    <main class="page-main page-stack">
      <header class="space-y-1">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">{{ 'decklist.pageTitle' | translate }}</h1>
        <p class="text-base-content/70 text-sm sm:text-base max-w-2xl">
          {{ 'decklist.pageSubtitle' | translate }}
        </p>
      </header>

      <app-decklist-panel />
    </main>
  `,
})
export class DecklistPage {
  protected readonly i18n = inject(I18nService);
}
