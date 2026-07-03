import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  CardKnowledgeDisplayTag,
  CardKnowledgeEffect,
  CardRelatedGroup,
  CardRelatedSuggestion,
} from '../../models/card-knowledge.model';
import { CardKnowledgeService } from '../../services/card-knowledge.service';
import { I18nService } from '../../services/i18n.service';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-related-panel',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <section
      [class.card]="!embedded()"
      [class.bg-base-100]="!embedded()"
      [class.shadow-xl]="!embedded()"
      [class.border]="!embedded()"
      [class.border-base-300]="!embedded()"
      [class.mt-4]="!embedded()"
      [class.sm:mt-6]="!embedded()"
    >
      <div class="card-body p-4 sm:p-6 space-y-4" [class.p-0]="embedded()">
        <header class="space-y-1">
          <h3 class="font-bold text-lg">{{ 'knowledge.title' | translate }}</h3>
          <p class="text-sm text-base-content/60">{{ 'knowledge.subtitle' | translate }}</p>
        </header>

        @if (!available()) {
          <p class="text-sm text-base-content/60">{{ 'knowledge.unavailable' | translate }}</p>
        } @else if (loading()) {
          <p class="text-sm text-base-content/60">{{ 'knowledge.loading' | translate }}</p>
        } @else {
          @if (displayTags().length > 0) {
            <div class="space-y-1">
              <span class="text-xs text-base-content/50">{{ 'knowledge.mechanics' | translate }}</span>
              <div class="flex flex-wrap gap-1">
                @for (tag of displayTags(); track tag.id) {
                  <span class="badge badge-secondary badge-sm badge-outline">{{ (tag.labelKey) | translate }}</span>
                }
              </div>
            </div>
          }

          @if (series().length > 0) {
            <div class="space-y-1">
              <span class="text-xs text-base-content/50">{{ 'knowledge.series' | translate }}</span>
              <div class="flex flex-wrap gap-1">
                @for (label of series(); track label) {
                  <span class="badge badge-primary badge-sm badge-outline">{{ label }}</span>
                }
              </div>
            </div>
          }

          @if (mentions().length > 0) {
            <div class="space-y-1">
              <span class="text-xs text-base-content/50">{{ 'knowledge.mentions' | translate }}</span>
              <div class="flex flex-wrap gap-1">
                @for (label of mentions(); track label) {
                  <span class="badge badge-accent badge-sm badge-outline">{{ label }}</span>
                }
              </div>
            </div>
          }

          @if (effects().length > 0) {
            <div class="space-y-1">
              <span class="text-xs text-base-content/50">{{ 'knowledge.effects' | translate }}</span>
              <div class="flex flex-wrap gap-1">
                @for (effect of effects(); track effect.kind) {
                  <span class="badge badge-info badge-sm badge-outline">
                    {{ effectLabel(effect) }}
                  </span>
                }
              </div>
            </div>
          }

          @if (groups().length === 0) {
            <p class="text-sm text-base-content/60">{{ 'knowledge.empty' | translate }}</p>
          } @else {
            <div class="space-y-4">
              @for (group of groups(); track group.relation) {
                <div class="space-y-2">
                  <h4 class="text-sm font-semibold text-base-content/80">
                    {{ (group.labelKey) | translate }}
                    <span class="badge badge-ghost badge-xs ml-1">{{ group.suggestions.length }}</span>
                  </h4>
                  <ul class="space-y-2">
                    @for (item of group.suggestions; track item.cardId) {
                      <li>
                        <button
                          type="button"
                          class="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-base-200/80 text-left transition-colors"
                          (click)="cardSelected.emit(item.cardId)"
                        >
                          <img [src]="item.imageSmall" [alt]="" class="w-9 h-12 object-cover rounded shrink-0" loading="lazy" />
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium truncate">{{ item.name }}</p>
                            <p class="text-[11px] text-base-content/60 truncate">
                              {{ (item.reasonKey) | translate: item.reasonParams }}
                            </p>
                          </div>
                          <span class="badge badge-xs shrink-0 badge-ghost">{{ relationLabel(item.relation) }}</span>
                          @if (item.maxCopies !== undefined && item.maxCopies < 3) {
                            <span class="badge badge-xs shrink-0 badge-warning">
                              {{ 'knowledge.maxCopies' | translate: { count: '' + item.maxCopies } }}
                            </span>
                          }
                        </button>
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          }
        }
      </div>
    </section>
  `,
})
export class CardRelatedPanelComponent {
  readonly loading = input(false);
  readonly available = input(true);
  readonly series = input<string[]>([]);
  readonly mentions = input<string[]>([]);
  readonly effects = input<CardKnowledgeEffect[]>([]);
  readonly displayTags = input<CardKnowledgeDisplayTag[]>([]);
  readonly groups = input<CardRelatedGroup[]>([]);
  readonly suggestions = input<CardRelatedSuggestion[]>([]);
  readonly embedded = input(false);

  readonly cardSelected = output<number>();

  protected readonly i18n = inject(I18nService);
  private readonly knowledge = inject(CardKnowledgeService);

  relationLabel(relation: string): string {
    const key = `knowledge.relation.${relation}`;
    const translated = this.i18n.t(key);
    return translated === key ? relation : translated;
  }

  effectLabel(effect: CardKnowledgeEffect): string {
    const key = this.knowledge.effectLabelKey(effect);
    const translated = this.i18n.t(key, this.knowledge.effectLabelParams(effect));
    return translated === key ? effect.kind : translated;
  }
}
