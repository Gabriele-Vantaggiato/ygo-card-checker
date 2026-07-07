import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DecklistPanelComponent } from '../../../components/decklist-panel/decklist-panel.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-page',
  standalone: true,
  imports: [DecklistPanelComponent, PageHeaderComponent],  template: `
    <main class="page-main page-stack">
      <app-page-header
        titleKey="decklist.pageTitle"
        subtitleKey="decklist.pageSubtitle"
      />

      <app-decklist-panel />
    </main>
  `,
})
export class DecklistPage {}