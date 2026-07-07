import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-duel-collapse',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="duel-panel group" [attr.open]="open() ? true : null">
      <summary
        class="cursor-pointer list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
        [class.duel-panel-header]="!compactHeader()"
        [class.px-3]="compactHeader()"
        [class.py-2.5]="compactHeader()"
        [class.sm:px-4]="compactHeader()"
        [class.sm:py-3]="compactHeader()"
        [class.border-b]="compactHeader()"
        [class.border-base-300/70]="compactHeader()"
      >
        <span class="flex items-center gap-2 min-w-0">
          <span class="text-primary/80 transition-transform group-open:rotate-90 shrink-0" aria-hidden="true">›</span>
          <span
            class="truncate"
            [class.text-sm]="compactHeader()"
            [class.font-semibold]="compactHeader()"
            [class.text-base-content/80]="compactHeader()"
          >
            {{ titleKey() | translate }}
          </span>
        </span>
        <ng-content select="[summary-extra]" />
      </summary>
      <div [class]="bodyClass()">
        <ng-content />
      </div>
    </details>
  `,
})
export class DuelCollapseComponent {
  readonly titleKey = input.required<string>();
  readonly open = input(false);
  readonly compactHeader = input(false);
  readonly bodyClass = input('p-3 sm:p-4 space-y-3');
}
