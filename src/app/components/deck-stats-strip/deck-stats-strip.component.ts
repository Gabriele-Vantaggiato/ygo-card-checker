import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecklistCard } from '../../models/decklist.model';
import { I18nService } from '../../services/i18n.service';
import { sectionCardCount, splitDeckSections } from '../../utils/deck-card.utils';

export interface DeckSectionStat {
  key: 'main' | 'extra' | 'side';
  labelKey: string;
  count: number;
  max: number | null;
  progress: number | null;
}

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-deck-stats-strip',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div
      class="flex flex-wrap items-center gap-3 sm:gap-4"
      [class.duel-panel]="!embedded()"
      [class.px-3]="!embedded()"
      [class.py-2.5]="!embedded()"
      [class.sm:px-4]="!embedded()"
    >
      @for (stat of stats(); track stat.key) {
        <div class="flex items-center gap-2">
          <span class="duel-section-chip bg-base-200/80 text-base-content/80">
            {{ (stat.labelKey) | translate }}
            <span class="text-primary">{{ stat.count }}</span>
            @if (stat.max !== null) {
              <span class="text-base-content/40">/{{ stat.max }}</span>
            }
          </span>
          @if (stat.progress !== null) {
            <progress
              class="progress progress-primary w-20 sm:w-28 h-2"
              [value]="stat.progress"
              max="100"
            ></progress>
          }
        </div>
      }
      <div class="ml-auto text-xs text-base-content/50 tabular-nums font-medium">
        {{ 'decklist.stats.total' | translate: { count: '' + totalCards() } }}
      </div>
    </div>
  `,
})
export class DeckStatsStripComponent {
  readonly cards = input.required<readonly DecklistCard[]>();
  readonly mainTarget = input(40);
  readonly embedded = input(false);

  protected readonly i18n = inject(I18nService);

  readonly totalCards = computed(() =>
    this.cards().reduce((sum, card) => sum + card.quantity, 0),
  );

  readonly stats = computed((): DeckSectionStat[] => {
    const sections = splitDeckSections(this.cards());
    const mainCount = sectionCardCount(sections.main);
    const target = this.mainTarget();
    return [
      {
        key: 'main',
        labelKey: 'decklist.editor.main',
        count: mainCount,
        max: target,
        progress: Math.min(100, Math.round((mainCount / target) * 100)),
      },
      {
        key: 'extra',
        labelKey: 'decklist.editor.extra',
        count: sectionCardCount(sections.extra),
        max: 15,
        progress: null,
      },
      {
        key: 'side',
        labelKey: 'decklist.editor.side',
        count: sectionCardCount(sections.side),
        max: 15,
        progress: null,
      },
    ];
  });
}
