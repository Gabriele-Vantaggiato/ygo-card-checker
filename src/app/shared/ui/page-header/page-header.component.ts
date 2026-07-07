import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-0.5 min-w-0">
        <h1 class="page-title">{{ titleKey() | translate }}</h1>
        @if (subtitleKey()) {
          <p class="page-subtitle">{{ subtitleKey()! | translate }}</p>
        }
      </div>
      <ng-content />
    </header>
  `,
})
export class PageHeaderComponent {
  readonly titleKey = input.required<string>();
  readonly subtitleKey = input<string | null>(null);
}
