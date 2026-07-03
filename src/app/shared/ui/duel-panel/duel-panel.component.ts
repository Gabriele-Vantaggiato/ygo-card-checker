import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-duel-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="duel-panel flex flex-col overflow-hidden min-w-0" [class]="panelClass()">
      @if (title()) {
        <header class="duel-panel-header shrink-0">
          {{ title() }}
        </header>
      }
      <ng-content />
    </section>
  `,
})
export class DuelPanelComponent {
  readonly title = input<string | null>(null);
  readonly panelClass = input('');
}
