import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DecklistPanelComponent } from '../../../components/decklist-panel/decklist-panel.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-page',
  standalone: true,
  imports: [DecklistPanelComponent],  template: `
    <main class="page-main page-stack">
<app-decklist-panel />
    </main>
  `,
})
export class DecklistPage {}