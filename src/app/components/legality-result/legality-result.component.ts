import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CardTilt3dComponent } from '../card-tilt-3d/card-tilt-3d.component';
import { AddToDecklistButtonComponent } from '../add-to-decklist-btn/add-to-decklist-btn.component';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { AddToDecklistPayload } from '../../models/decklist.model';
import { SearchHistoryEntry } from '../../models/search-history.model';
import { YgoFormat } from '../../models/ygo-format.model';
import { I18nService } from '../../services/i18n.service';
import {
  banlistStatusLabelKey,
  verdictBadgeClass,
  verdictLabelKey,
} from '../../utils/legality-display.utils';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { VerdictBadgeComponent } from '../../shared/ui/verdict-badge/verdict-badge.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-legality-result',
  standalone: true,
  imports: [CardTilt3dComponent, AddToDecklistButtonComponent, TranslatePipe, VerdictBadgeComponent],
  template: `
    @if (!card()) {
      <div class="empty-state min-h-56 lg:min-h-[calc(100vh-12rem)]">
        <div class="empty-state-icon" aria-hidden="true">🃏</div>
        <h2 class="empty-state-title">{{ 'result.emptyTitle' | translate }}</h2>
        <p class="empty-state-hint">{{ 'result.selectCard' | translate }}</p>
        @if (quickPickEntry(); as entry) {
          <button
            type="button"
            class="btn btn-outline btn-sm gap-2 mt-3"
            (click)="historyPick.emit(entry)"
          >
            @if (entry.imageUrlSmall; as src) {
              <img [src]="src" [alt]="" class="w-6 h-8 object-cover rounded" />
            }
            {{ entry.name }}
          </button>
        }
      </div>
    } @else if (result(); as res) {
      <div
        class="overflow-visible"
        [class.duel-panel]="!embedded()"
        [class.border]="!embedded()"
        [class.border-base-300/80]="!embedded()"
      >
        <div class="card-body !items-start !justify-start p-4 sm:p-6">
          <div
            class="grid w-full grid-cols-1 content-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:items-start"
          >
            @if (cardImageLarge(); as src) {
              <div class="mx-auto h-fit w-full max-w-[220px] self-start sm:max-w-[260px] lg:mx-0 lg:max-w-[280px]">
                @defer (on idle) {
                  <app-card-tilt-3d [src]="src" [alt]="card()!.name" />
                } @placeholder {
                  <img [src]="src" [alt]="card()!.name" class="w-full rounded-lg shadow-lg" />
                }
              </div>
            }

            <div class="min-w-0 self-start space-y-4 w-full">
              <header class="space-y-3">
                <div class="space-y-1">
                  <h2 class="text-xl sm:text-2xl font-bold leading-tight">{{ card()!.name }}</h2>
                  <p class="text-sm text-base-content/70">{{ card()!.type }}</p>
                </div>

                <div class="rounded-xl border border-base-300 bg-base-200/40 p-3 w-full sm:max-w-sm flex flex-col gap-2">
                  <app-verdict-badge mode="verdict" [verdict]="res.verdict" size="lg" [fullWidth]="true" />
                  <app-verdict-badge mode="quantity" [banlistStatus]="res.banlistStatus" size="sm" [fullWidth]="true" />
                </div>

                <app-add-to-decklist-btn
                  variant="labeled"
                  [payload]="deckPayload()"
                  [banlistStatus]="res.banlistStatus"
                />
              </header>

              @if (card()!.desc) {
                <section class="rounded-lg bg-base-200/50 p-4">
                  <h3 class="font-semibold mb-2 text-sm uppercase tracking-wide text-base-content/80">
                    {{ 'result.effect' | translate }}
                  </h3>
                  <p class="text-sm leading-relaxed whitespace-pre-line text-base-content/90 max-h-48 overflow-y-auto">
                    {{ card()!.desc }}
                  </p>
                </section>
              }

              <details class="rounded-lg border border-base-300/80 bg-base-200/20 group">
                <summary class="cursor-pointer px-4 py-3 text-sm font-semibold text-base-content/80 list-none flex items-center justify-between">
                  <span>{{ 'result.detailsLegality' | translate }}</span>
                  <span class="text-base-content/40 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
                </summary>
                <div class="px-4 pb-4 space-y-3 border-t border-base-300/60 pt-3">
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    @if (res.tcgDate) {
                      <div>
                        <span class="font-medium">{{ 'result.tcgDate' | translate }}:</span>
                        {{ res.tcgDate }}
                      </div>
                    }
                    <div>
                      <span class="font-medium">{{ 'result.banlistStatus' | translate }}:</span>
                      {{ (banlistStatusLabelKey(res.banlistStatus)) | translate }}
                    </div>
                    @if (format()?.banlistEffectiveDate) {
                      <div>
                        <span class="font-medium">{{ 'result.banlistDate' | translate }}:</span>
                        {{ format()!.banlistEffectiveDate }}
                      </div>
                    }
                    @if (format()?.cardPoolEndDate) {
                      <div>
                        <span class="font-medium">{{ 'result.cardPool' | translate }}:</span>
                        {{ format()!.cardPoolEndDate }}
                      </div>
                    }
                  </div>

                  <div>
                    <h4 class="font-medium mb-1 text-sm">{{ 'result.reasons' | translate }}</h4>
                    <ul class="list-disc list-inside text-sm space-y-1 text-base-content/80">
                      @for (reason of res.reasons; track $index) {
                        <li>{{ (reason.key) | translate: reason.params }}</li>
                      }
                    </ul>
                  </div>
                </div>
              </details>
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
  readonly embedded = input(false);
  readonly historyEntries = input<SearchHistoryEntry[]>([]);

  readonly historyPick = output<SearchHistoryEntry>();

  constructor(protected readonly i18n: I18nService) {}

  quickPickEntry(): SearchHistoryEntry | null {
    return this.historyEntries()[0] ?? null;
  }

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

  protected readonly verdictBadgeClass = verdictBadgeClass;
  protected readonly verdictLabelKey = verdictLabelKey;
  protected readonly banlistStatusLabelKey = banlistStatusLabelKey;
}
