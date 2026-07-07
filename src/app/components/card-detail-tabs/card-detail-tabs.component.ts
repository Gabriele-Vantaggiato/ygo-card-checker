import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardRelatedPanelComponent } from '../card-related-panel/card-related-panel.component';
import { LegalityResultComponent } from '../legality-result/legality-result.component';
import { ComboLine, ComboResult } from '../../models/card-combo.model';
import {
  CardKnowledgeDisplayTag,
  CardKnowledgeEffect,
  CardRelatedGroup,
  CardRelatedSuggestion,
} from '../../models/card-knowledge.model';
import { SearchHistoryEntry } from '../../models/search-history.model';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { YgoFormat } from '../../models/ygo-format.model';
import { CardComboService } from '../../services/card-combo.service';
import { I18nService } from '../../services/i18n.service';

type DetailTab = 'legality' | 'related' | 'combo';

const EMPTY_COMBO: ComboResult = {
  tags: [],
  displayTags: [],
  effects: [],
  requirements: [],
  payoffs: [],
  enablers: [],
  targets: [],
  synergies: [],
  lines: [],
  available: false,
};

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-detail-tabs',
  standalone: true,
  imports: [LegalityResultComponent, CardRelatedPanelComponent, RouterLink,
    TranslatePipe],
  template: `
    @if (card()) {
      <div class="duel-panel overflow-hidden">
        <div role="tablist" class="workspace-tabs mx-3 mt-3 sm:mx-4 sm:mt-4">
          <button
            type="button"
            role="tab"
            class="workspace-tab"
            [class.tab-active]="activeTab() === 'legality'"
            [attr.aria-selected]="activeTab() === 'legality'"
            (click)="activeTab.set('legality')"
          >
            {{ 'detail.tab.legality' | translate }}
          </button>
          <button
            type="button"
            role="tab"
            class="workspace-tab"
            [class.tab-active]="activeTab() === 'related'"
            [attr.aria-selected]="activeTab() === 'related'"
            (click)="activeTab.set('related')"
          >
            {{ 'detail.tab.related' | translate }}
          </button>
          <button
            type="button"
            role="tab"
            class="workspace-tab"
            [class.tab-active]="activeTab() === 'combo'"
            [attr.aria-selected]="activeTab() === 'combo'"
            (click)="activeTab.set('combo')"
          >
            {{ 'detail.tab.combo' | translate }}
          </button>
        </div>

        <div class="p-0">
          @switch (activeTab()) {
            @case ('legality') {
              <app-legality-result
                [embedded]="true"
                [card]="card()"
                [result]="result()"
                [format]="format()"
              />
            }
            @case ('related') {
              @defer (when activeTab() === 'related') {
                <div class="p-4 sm:p-6">
                  <app-card-related-panel
                    [embedded]="true"
                    [loading]="relatedLoading()"
                    [available]="relatedAvailable()"
                    [series]="relatedSeries()"
                    [mentions]="relatedMentions()"
                    [effects]="relatedEffects()"
                    [displayTags]="relatedTags()"
                    [groups]="relatedGroups()"
                    [suggestions]="relatedSuggestions()"
                    (cardSelected)="relatedCardSelect.emit($event)"
                  />
                </div>
              } @placeholder {
                <div class="p-4 sm:p-6">
                  <p class="text-sm text-base-content/60">{{ 'search.loading' | translate }}</p>
                </div>
              }
            }
            @case ('combo') {
              @defer (when activeTab() === 'combo') {
                <div class="p-4 sm:p-6 space-y-4">
                @if (comboLoading()) {
                  <p class="text-sm text-base-content/60">{{ 'combo.loading' | translate }}</p>
                } @else if (!combo().available) {
                  <p class="text-sm text-base-content/60">{{ 'combo.unavailable' | translate }}</p>
                } @else if (combo().lines.length === 0) {
                  <p class="text-sm text-base-content/60">{{ 'combo.unparsed' | translate }}</p>
                } @else {
                  <p class="text-sm text-base-content/60">{{ 'detail.comboPreview' | translate }}</p>
                  @for (line of previewLines(); track line.id) {
                    <article class="rounded-xl border border-base-300 bg-base-200/30 p-3 space-y-2">
                      <ol class="space-y-2">
                        @for (step of line.steps; track step.cardId + step.role; let idx = $index) {
                          <li class="flex items-center gap-3">
                            <span class="badge badge-neutral badge-sm shrink-0">{{ idx + 1 }}</span>
                            <img [src]="step.imageSmall" [alt]="" class="w-8 h-11 object-cover rounded shrink-0" loading="lazy" />
                            <div class="min-w-0 flex-1">
                              <p class="text-sm font-medium truncate">{{ step.name }}</p>
                              <p class="text-[11px] text-base-content/60 truncate">
                                {{ (step.reasonKey) | translate: step.reasonParams }}
                              </p>
                            </div>
                          </li>
                        }
                      </ol>
                    </article>
                  }
                }

                <div class="flex justify-end pt-2">
                  <a
                    routerLink="/combo"
                    [queryParams]="{ cardId: card()!.id }"
                    class="btn btn-outline btn-primary btn-sm gap-2"
                  >
                    {{ 'combo.openPage' | translate }}
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
                </div>
              } @placeholder {
                <div class="p-4 sm:p-6">
                  <p class="text-sm text-base-content/60">{{ 'combo.loading' | translate }}</p>
                </div>
              }
            }
          }
        </div>
      </div>
    } @else {
      <app-legality-result
        [card]="null"
        [result]="null"
        [format]="format()"
        [historyEntries]="historyEntries()"
        (historyPick)="historyPick.emit($event)"
      />
    }
  `,
})
export class CardDetailTabsComponent {
  readonly card = input<YgoCard | null>(null);
  readonly result = input<LegalityResult | null>(null);
  readonly format = input<YgoFormat | null>(null);
  readonly historyEntries = input<SearchHistoryEntry[]>([]);

  readonly relatedLoading = input(false);
  readonly relatedAvailable = input(true);
  readonly relatedSeries = input<string[]>([]);
  readonly relatedMentions = input<string[]>([]);
  readonly relatedEffects = input<CardKnowledgeEffect[]>([]);
  readonly relatedTags = input<CardKnowledgeDisplayTag[]>([]);
  readonly relatedGroups = input<CardRelatedGroup[]>([]);
  readonly relatedSuggestions = input<CardRelatedSuggestion[]>([]);

  readonly historyPick = output<SearchHistoryEntry>();
  readonly relatedCardSelect = output<number>();

  protected readonly i18n = inject(I18nService);
  private readonly comboService = inject(CardComboService);

  readonly activeTab = signal<DetailTab>('legality');
  readonly combo = signal<ComboResult>(EMPTY_COMBO);
  readonly comboLoading = signal(false);

  constructor() {
    effect((onCleanup) => {
      const card = this.card();
      const format = this.format();
      if (!card || !format) {
        this.combo.set(EMPTY_COMBO);
        this.comboLoading.set(false);
        return;
      }

      this.comboLoading.set(true);
      const sub = this.comboService.findCombos$(card, format).subscribe({
        next: (result) => {
          this.combo.set(result);
          this.comboLoading.set(false);
        },
        error: () => {
          this.combo.set(EMPTY_COMBO);
          this.comboLoading.set(false);
        },
      });
      onCleanup(() => sub.unsubscribe());
    });

    effect(() => {
      if (this.card()) {
        this.activeTab.set('legality');
      }
    });
  }

  previewLines(): ComboLine[] {
    return this.combo().lines.slice(0, 2);
  }
}
