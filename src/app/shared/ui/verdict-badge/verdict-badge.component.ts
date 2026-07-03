import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LegalityVerdict } from '../../../models/ygo-card.model';
import { BanlistStatus } from '../../../models/ygo-format.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import {
  quantityBadgeClass,
  quantityLabelKey,
  verdictBadgeClass,
  verdictLabelKey,
  verdictShortKey,
} from '../../../utils/legality-display.utils';

export type VerdictBadgeMode = 'verdict' | 'quantity' | 'verdict-short';

@Component({
  selector: 'app-verdict-badge',
  standalone: true,
  imports: [NgClass, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="badge duel-verdict-badge badge-{{ size() }} {{ fullWidth() ? 'w-full justify-center' : '' }}"
      [ngClass]="
        mode() === 'quantity'
          ? banlistStatus()
            ? quantityBadgeClass(banlistStatus()!)
            : 'badge-ghost'
          : verdict()
            ? verdictBadgeClass(verdict()!)
            : 'badge-ghost'
      "
    >
      @switch (mode()) {
        @case ('quantity') {
          {{ (banlistStatus() ? quantityLabelKey(banlistStatus()!) : 'result.notLegal') | translate }}
        }
        @case ('verdict-short') {
          {{ (verdict() ? verdictShortKey(verdict()!) : 'result.notLegal') | translate }}
        }
        @default {
          {{ (verdict() ? verdictLabelKey(verdict()!) : 'result.notLegal') | translate }}
        }
      }
    </span>
  `,
})
export class VerdictBadgeComponent {
  readonly mode = input<VerdictBadgeMode>('verdict');
  readonly verdict = input<LegalityVerdict | null>(null);
  readonly banlistStatus = input<BanlistStatus | null>(null);
  readonly size = input<'xs' | 'sm' | 'lg'>('sm');
  readonly fullWidth = input(false);

  protected readonly quantityBadgeClass = quantityBadgeClass;
  protected readonly quantityLabelKey = quantityLabelKey;
  protected readonly verdictBadgeClass = verdictBadgeClass;
  protected readonly verdictLabelKey = verdictLabelKey;
  protected readonly verdictShortKey = verdictShortKey;
}
