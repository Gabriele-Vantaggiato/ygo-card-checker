import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      @if (icon()) {
        <span class="empty-state-icon" aria-hidden="true">{{ icon() }}</span>
      }
      <p class="empty-state-title">{{ titleKey() | translate }}</p>
      @if (hintKey()) {
        <p class="empty-state-hint">{{ hintKey()! | translate }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input<string | null>(null);
  readonly titleKey = input.required<string>();
  readonly hintKey = input<string | null>(null);
}
