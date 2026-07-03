import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
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
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [class]="badgeClass()">
      {{ labelKey() | translate }}
    </span>
  `,
})
export class VerdictBadgeComponent {
  readonly mode = input<VerdictBadgeMode>('verdict');
  readonly verdict = input<LegalityVerdict | null>(null);
  readonly banlistStatus = input<BanlistStatus | null>(null);
  readonly size = input<'xs' | 'sm' | 'lg'>('sm');

  readonly badgeClass = computed(() => {
    const sizeClass = `badge-${this.size()}`;
    const mode = this.mode();
    if (mode === 'quantity' && this.banlistStatus()) {
      return `${sizeClass} ${quantityBadgeClass(this.banlistStatus()!)}`;
    }
    if (this.verdict()) {
      return `${sizeClass} ${verdictBadgeClass(this.verdict()!)}`;
    }
    return `${sizeClass} badge-ghost duel-verdict-badge`;
  });

  readonly labelKey = computed(() => {
    const mode = this.mode();
    if (mode === 'quantity' && this.banlistStatus()) {
      return quantityLabelKey(this.banlistStatus()!);
    }
    if (mode === 'verdict-short' && this.verdict()) {
      return verdictShortKey(this.verdict()!);
    }
    if (this.verdict()) {
      return verdictLabelKey(this.verdict()!);
    }
    return 'result.notLegal';
  });
}
