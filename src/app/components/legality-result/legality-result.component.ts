import { Component, input } from '@angular/core';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { BanlistStatus, YgoFormat } from '../../models/ygo-format.model';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-legality-result',
  standalone: true,
  template: `
    @if (!card()) {
      <div class="alert">
        <span>{{ i18n.t('result.selectCard') }}</span>
      </div>
    } @else if (result(); as res) {
      <div class="card bg-base-100 shadow-xl border border-base-300">
        <div class="card-body">
          <div class="flex flex-col sm:flex-row gap-4 items-start">
            @if (cardImage(); as src) {
              <img
                [src]="src"
                [alt]="card()!.name"
                class="w-32 rounded-lg shadow"
                loading="lazy"
              />
            }
            <div class="flex-1 space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="card-title text-xl">{{ card()!.name }}</h2>
                <span class="badge badge-lg" [class]="badgeClass(res.verdict)">
                  {{ verdictLabel(res.verdict) }}
                </span>
                <span class="badge badge-lg badge-outline" [class]="banlistBadgeClass(res.banlistStatus)">
                  {{ banlistStatusLabel(res.banlistStatus) }}
                </span>
              </div>

              <p class="text-sm text-base-content/70">{{ card()!.type }}</p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                @if (res.tcgDate) {
                  <div>
                    <span class="font-medium">{{ i18n.t('result.tcgDate') }}:</span>
                    {{ res.tcgDate }}
                  </div>
                }
                <div>
                  <span class="font-medium">{{ i18n.t('result.banlistStatus') }}:</span>
                  {{ banlistStatusLabel(res.banlistStatus) }}
                </div>
                @if (format()?.banlistEffectiveDate) {
                  <div>
                    <span class="font-medium">{{ i18n.t('result.banlistDate') }}:</span>
                    {{ format()!.banlistEffectiveDate }}
                  </div>
                }
                @if (format()?.cardPoolEndDate) {
                  <div>
                    <span class="font-medium">{{ i18n.t('result.cardPool') }}:</span>
                    {{ format()!.cardPoolEndDate }}
                  </div>
                }
              </div>

              <div>
                <h3 class="font-medium mb-1">{{ i18n.t('result.reasons') }}</h3>
                <ul class="list-disc list-inside text-sm space-y-1 text-base-content/80">
                  @for (reason of res.reasons; track $index) {
                    <li>{{ i18n.t(reason.key, reason.params) }}</li>
                  }
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class LegalityResultComponent {
  readonly card = input<YgoCard | null>(null);
  readonly result = input<LegalityResult | null>(null);
  readonly format = input<YgoFormat | null>(null);

  constructor(protected readonly i18n: I18nService) {}

  cardImage(): string | null {
    return this.card()?.card_images?.[0]?.image_url_small ?? null;
  }

  badgeClass(verdict: LegalityResult['verdict']): string {
    switch (verdict) {
      case 'legal':
        return 'badge-success';
      case 'restricted':
        return 'badge-warning';
      default:
        return 'badge-error';
    }
  }

  verdictLabel(verdict: LegalityResult['verdict']): string {
    switch (verdict) {
      case 'legal':
        return this.i18n.t('result.legal');
      case 'restricted':
        return this.i18n.t('result.restricted');
      default:
        return this.i18n.t('result.notLegal');
    }
  }

  banlistStatusLabel(status: BanlistStatus): string {
    switch (status) {
      case 'Forbidden':
        return this.i18n.t('banlist.forbidden');
      case 'Limited':
        return this.i18n.t('banlist.limited');
      case 'Semi-Limited':
        return this.i18n.t('banlist.semiLimited');
      default:
        return this.i18n.t('banlist.unlimited');
    }
  }

  banlistBadgeClass(status: BanlistStatus): string {
    switch (status) {
      case 'Forbidden':
        return 'badge-error';
      case 'Limited':
      case 'Semi-Limited':
        return 'badge-warning';
      default:
        return 'badge-success';
    }
  }
}
