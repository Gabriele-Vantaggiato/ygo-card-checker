import { ChangeDetectionStrategy, Component, isDevMode } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecklistPanelComponent } from '../../../components/decklist-panel/decklist-panel.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-page',
  standalone: true,
  imports: [DecklistPanelComponent, RouterLink],  template: `
    <main class="page-main page-stack">
@if (showIntentLab) {
  <a routerLink="/intent-runtime">Apri Intent Runtime</a>
}
<app-decklist-panel />
    </main>
  `,
})
export class DecklistPage {
  readonly showIntentLab = isDevMode() && ['127.0.0.1', 'localhost'].includes(window.location.hostname);
}
