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
      <header class="page-header">
        <h1 class="page-title">{{ 'decklist.pageTitle' | translate }}</h1>
        <p class="page-subtitle">{{ 'decklist.pageSubtitle' | translate }}</p>
      </header>

      <app-decklist-panel />
    </main>
  `,
})
export class DecklistPage {
  protected readonly i18n = inject(I18nService);
}
