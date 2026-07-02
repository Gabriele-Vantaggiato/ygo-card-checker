import { Component, input } from '@angular/core';
import { CardTilt3dComponent } from '../card-tilt-3d/card-tilt-3d.component';
import { AddToDecklistButtonComponent } from '../add-to-decklist-btn/add-to-decklist-btn.component';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { AddToDecklistPayload } from '../../models/decklist.model';
import { BanlistStatus, YgoFormat } from '../../models/ygo-format.model';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-legality-result',
  standalone: true,
  imports: [CardTilt3dComponent, AddToDecklistButtonComponent],
  template: `
    @if (!card()) {
      <div
        class="card bg-base-100 shadow-xl border border-base-300 border-dashed min-h-64 lg:min-h-[calc(100vh-12rem)]"
      >
        <div class="card-body items-center justify-center text-center text-base-content/60">
          <span>{{ i18n.t('result.selectCard') }}</span>
        </div>
      </div>
    } @else if (result(); as res) {
      <div class="card bg-base-100 shadow-xl border border-base-300 overflow-visible">
        <div class="card-body !items-start !justify-start p-4 sm:p-6">
          <div
            class="grid w-full grid-cols-1 content-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:items-start"
          >
            @if (cardImageLarge(); as src) {
              <div class="mx-auto h-fit w-full max-w-[220px] self-start sm:max-w-[260px] lg:mx-0 lg:max-w-[280px]">
                <app-card-tilt-3d [src]="src" [alt]="card()!.name" />
              </div>
            }

            <div class="min-w-0 self-start space-y-4">
              <header class="space-y-2">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                    <h2 class="text-xl sm:text-2xl font-bold leading-tight">{{ card()!.name }}</h2>
                    <span class="badge badge-lg" [class]="badgeClass(res.verdict)">
                      {{ verdictLabel(res.verdict) }}
                    </span>
                    <span class="badge badge-lg badge-outline" [class]="banlistBadgeClass(res.banlistStatus)">
                      {{ banlistStatusLabel(res.banlistStatus) }}
                    </span>
                  </div>
                  <app-add-to-decklist-btn
                    class="shrink-0"
                    [payload]="deckPayload()"
                    [banlistStatus]="res.banlistStatus"
                  />
                </div>
                <p class="text-sm text-base-content/70">{{ card()!.type }}</p>
              </header>

              @if (card()!.desc) {
                <section class="rounded-lg bg-base-200/50 p-4">
                  <h3 class="font-semibold mb-2 text-sm uppercase tracking-wide text-base-content/80">
                    {{ i18n.t('result.effect') }}
                  </h3>
                  <p class="text-sm leading-relaxed whitespace-pre-line text-base-content/90">
                    {{ card()!.desc }}
                  </p>
                </section>
              }

              <section class="space-y-3 pt-2 border-t border-base-300">
                <h3 class="font-semibold text-sm uppercase tracking-wide text-base-content/80">
                  {{ i18n.t('result.legality') }}
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
                  <h4 class="font-medium mb-1 text-sm">{{ i18n.t('result.reasons') }}</h4>
                  <ul class="list-disc list-inside text-sm space-y-1 text-base-content/80">
                    @for (reason of res.reasons; track $index) {
                      <li>{{ i18n.t(reason.key, reason.params) }}</li>
                    }
                  </ul>
                </div>
              </section>
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

  cardImageLarge(): string | null {
    return (
      this.card()?.card_images?.[0]?.image_url ??
      this.card()?.card_images?.[0]?.image_url_small ??
      null
    );
  }

  deckPayload(): AddToDecklistPayload {
    const card = this.card()!;
    return {
      id: card.id,
      name: card.name,
      type: card.type,
      imageUrlSmall: card.card_images?.[0]?.image_url_small ?? null,
    };
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
