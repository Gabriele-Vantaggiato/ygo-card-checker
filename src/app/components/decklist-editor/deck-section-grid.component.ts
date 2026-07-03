import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DecklistCard } from '../../models/decklist.model';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { verdictBannerClass } from '../../utils/legality-display.utils';
import { DeckSectionViewModel } from './decklist-editor.model';

@Component({
  selector: 'app-deck-section-grid',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="duel-panel overflow-hidden flex flex-col min-h-[24rem]">
      <div class="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-4 max-h-[min(70vh,48rem)]">
        @for (section of sections(); track section.key) {
          <div>
            <div
              class="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 px-2 py-1.5 rounded-lg bg-base-200/80 border border-base-300"
            >
              <span class="font-semibold text-sm">{{ section.titleKey | translate }}</span>
              <span class="text-xs text-base-content/60 tabular-nums">{{ section.count }}</span>
              <div class="flex gap-1.5 ml-auto text-[11px] font-medium">
                <span
                  class="duel-section-chip bg-warning/15 text-warning"
                  [title]="'decklist.editor.type.monsters' | translate"
                >
                  {{ section.monsters }}M
                </span>
                <span
                  class="duel-section-chip bg-success/15 text-success"
                  [title]="'decklist.editor.type.spells' | translate"
                >
                  {{ section.spells }}S
                </span>
                <span
                  class="duel-section-chip bg-secondary/15 text-secondary"
                  [title]="'decklist.editor.type.traps' | translate"
                >
                  {{ section.traps }}T
                </span>
              </div>
            </div>

            @if (section.cards.length === 0) {
              <p class="text-xs text-base-content/50 px-2 py-6 text-center border border-dashed border-base-300 rounded-lg">
                {{ section.emptyKey | translate }}
              </p>
            } @else {
              <div class="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 p-1">
                @for (cell of section.expandedCards; track cell.card.id + '-' + $index) {
                  <div
                    class="group relative aspect-[59/86] rounded transition-transform duration-200 ease-out hover:scale-[1.35] hover:z-30"
                  >
                    <button
                      type="button"
                      class="relative w-full h-full rounded overflow-hidden border-2 transition-colors"
                      [class.border-primary]="inspectedCardId() === cell.card.id"
                      [class.border-transparent]="inspectedCardId() !== cell.card.id"
                      [class.ring-2]="inspectedCardId() === cell.card.id"
                      [class.ring-primary/40]="inspectedCardId() === cell.card.id"
                      (click)="cardInspect.emit(cell.card)"
                    >
                      @if (cell.card.imageUrlSmall; as src) {
                        <img [src]="src" [alt]="" class="w-full h-full object-cover" loading="lazy" />
                      } @else {
                        <span class="block w-full h-full bg-base-300"></span>
                      }
                      @if (cell.card.legalityVerdict; as verdict) {
                        @if (verdict !== 'legal' && cell.verdictShortKey; as shortKey) {
                          <span
                            class="absolute bottom-0 inset-x-0 z-10 text-[8px] sm:text-[9px] font-bold text-center py-0.5 leading-tight truncate px-0.5"
                            [class]="verdictBannerClass(verdict)"
                          >
                            {{ shortKey | translate }}
                          </span>
                        }
                      }
                    </button>
                    <button
                      type="button"
                      class="absolute -top-0.5 -right-0.5 z-20 btn btn-error btn-circle shadow-md transition-opacity h-4 w-4 min-h-4 min-w-4 text-[9px] p-0 opacity-90 lg:-top-1 lg:-right-1 lg:btn-xs lg:h-auto lg:w-auto lg:min-h-0 lg:min-w-0 lg:opacity-0 lg:group-hover:opacity-100"
                      [attr.aria-label]="'decklist.editor.removeCopy' | translate"
                      (click)="cardRemove.emit({ cardId: cell.card.id, event: $event })"
                    >
                      ✕
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class DeckSectionGridComponent {
  readonly sections = input.required<DeckSectionViewModel[]>();
  readonly inspectedCardId = input<number | null>(null);

  readonly cardInspect = output<DecklistCard>();
  readonly cardRemove = output<{ cardId: number; event: Event }>();

  protected readonly verdictBannerClass = verdictBannerClass;
}
