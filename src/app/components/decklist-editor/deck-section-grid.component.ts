import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDragPreview, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { DecklistCard } from '../../models/decklist.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';
import { verdictBannerClass } from '../../utils/legality-display.utils';
import {
  DECK_SECTION_KEYS,
  DeckSectionKey,
  canPlaceCardInSection,
} from '../../utils/deck-section.utils';
import { DeckSectionViewModel } from './decklist-editor.model';

export interface DeckCardMoveEvent {
  cardId: number;
  from: DeckSectionKey;
  to: DeckSectionKey;
}

export interface DeckCardRemoveEvent {
  cardId: number;
  section: DeckSectionKey;
  event: Event;
}

@Component({
  selector: 'app-deck-section-grid',
  standalone: true,
  imports: [
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    CdkDragPreview,
    NgClass,
    TranslatePipe,
    DuelPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-duel-panel panelClass="overflow-hidden flex flex-col min-h-[24rem]">
      <p class="deck-dnd-hint px-3 pt-3 sm:px-4 text-[11px] text-base-content/50 leading-relaxed">
        {{ 'decklist.editor.dragHint' | translate }}
      </p>

      <div
        class="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 pt-2 pb-6 max-lg:pb-8 space-y-4 max-h-[min(70vh,48rem)]"
        cdkDropListGroup
      >
        @for (section of sections(); track section.key) {
          <section
            class="deck-section-drop"
            [class.deck-section-drop-target]="isDropTarget(section.key)"
            [attr.data-section]="section.key"
          >
            <div
              class="flex flex-wrap items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-base-200/50 border border-base-300/70"
            >
              <span class="font-semibold text-sm">{{ section.titleKey | translate }}</span>
              <span class="text-xs text-base-content/55 tabular-nums">{{ section.count }}</span>
              <div class="hidden sm:flex gap-1.5 ml-auto text-[11px] font-medium">
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

            <div
              class="deck-section-list grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 p-1.5 min-h-[5.5rem] rounded-xl border border-dashed border-base-300/70 bg-base-200/20 transition-colors"
              cdkDropList
              [id]="'deck-drop-' + section.key"
              [cdkDropListData]="section.key"
              [cdkDropListEnterPredicate]="canEnterSection"
              (cdkDropListDropped)="onDrop($event)"
              (cdkDropListEntered)="activeDropSection.set(section.key)"
              (cdkDropListExited)="clearDropTarget(section.key)"
            >
              @if (section.expandedCards.length === 0) {
                <p
                  class="col-span-full text-xs text-base-content/50 px-2 py-5 text-center pointer-events-none"
                >
                  {{ section.emptyKey | translate }}
                </p>
              } @else {
                @for (cell of section.expandedCards; track cell.card.id + '-' + $index) {
                  <div
                    class="group relative aspect-[59/86] rounded deck-card-tile"
                    cdkDrag
                    [cdkDragData]="cell.card"
                    [cdkDragStartDelay]="dragStartDelayMs"
                    (cdkDragStarted)="onDragStarted(section.key)"
                    (cdkDragEnded)="onDragEnded()"
                  >
                    <div *cdkDragPlaceholder class="deck-drag-placeholder aspect-[59/86] rounded"></div>
                    <div *cdkDragPreview class="deck-drag-preview">
                      @if (cell.card.imageUrlSmall; as src) {
                        <img [src]="src" [alt]="" class="w-full h-full object-cover rounded" />
                      }
                    </div>

                    <button
                      type="button"
                      class="relative w-full h-full rounded overflow-hidden border-2 transition-colors duration-150"
                      [class.border-primary]="inspectedCardId() === cell.card.id"
                      [class.border-transparent]="inspectedCardId() !== cell.card.id"
                      [class.ring-2]="inspectedCardId() === cell.card.id"
                      [class.ring-primary/40]="inspectedCardId() === cell.card.id"
                      (click)="cardInspect.emit(cell.card)"
                    >
                      @if (cell.card.imageUrlSmall; as src) {
                        <img
                          [src]="src"
                          [alt]=""
                          class="w-full h-full object-cover pointer-events-none"
                          loading="lazy"
                          draggable="false"
                        />
                      } @else {
                        <span class="block w-full h-full bg-base-300"></span>
                      }
                      @if (cell.card.legalityVerdict; as verdict) {
                        @if (verdict !== 'legal' && cell.verdictShortKey; as shortKey) {
                          <span
                            class="absolute bottom-0 inset-x-0 text-[8px] sm:text-[9px] font-bold text-center py-0.5 leading-tight truncate px-0.5"
                            [class]="verdictBannerClass(verdict)"
                          >
                            {{ shortKey | translate }}
                          </span>
                        }
                      }
                    </button>

                    <button
                      type="button"
                      class="absolute -top-1 -right-1 btn btn-error btn-circle shadow-md transition-opacity h-6 w-6 min-h-6 min-w-6 text-[10px] p-0 opacity-95 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                      [attr.aria-label]="'decklist.editor.removeCopy' | translate"
                      (click)="
                        cardRemove.emit({
                          cardId: cell.card.id,
                          section: section.key,
                          event: $event,
                        })
                      "
                    >
                      ✕
                    </button>

                    <button
                      type="button"
                      class="absolute -bottom-1 -left-1 btn btn-primary btn-circle shadow-md h-7 w-7 min-h-7 min-w-7 text-[11px] p-0 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                      [attr.aria-label]="'decklist.editor.moveCopy' | translate"
                      (click)="openMoveMenu(cell.card, section.key, $event)"
                    >
                      ⇄
                    </button>
                  </div>
                }
              }
            </div>
          </section>
        }
      </div>
    </app-duel-panel>

    @if (moveMenu(); as menu) {
      <div class="deck-move-sheet" role="dialog" [attr.aria-label]="'decklist.editor.moveCopy' | translate">
        <button type="button" class="deck-move-sheet-backdrop" (click)="closeMoveMenu()"></button>
        <div class="deck-move-sheet-panel">
          <div class="flex items-start gap-3 mb-3">
            @if (menu.card.imageUrlSmall; as src) {
              <img [src]="src" [alt]="" class="w-10 h-14 object-cover rounded shadow" />
            }
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-sm leading-snug line-clamp-2">{{ menu.card.name }}</p>
              <p class="text-xs text-base-content/55 mt-0.5">
                {{ 'decklist.editor.moveFrom' | translate }}
                · {{ sectionTitleKey(menu.from) | translate }}
              </p>
            </div>
            <button type="button" class="btn btn-ghost btn-sm btn-square" (click)="closeMoveMenu()">
              ✕
            </button>
          </div>

          <p class="text-[11px] uppercase tracking-wide text-base-content/45 mb-2">
            {{ 'decklist.editor.moveTo' | translate }}
          </p>
          <div class="grid grid-cols-3 gap-2">
            @for (key of sectionKeys; track key) {
              <button
                type="button"
                class="btn btn-sm h-auto min-h-12 py-2 flex-col gap-0.5"
                [ngClass]="
                  key === menu.from
                    ? 'btn-disabled'
                    : canPlaceCardInSection(menu.card.type, key)
                      ? 'btn-primary btn-outline'
                      : 'btn-disabled'
                "
                [disabled]="key === menu.from || !canPlaceCardInSection(menu.card.type, key)"
                (click)="confirmMove(key)"
              >
                <span class="font-semibold">{{ sectionTitleKey(key) | translate }}</span>
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class DeckSectionGridComponent {
  readonly sections = input.required<DeckSectionViewModel[]>();
  readonly inspectedCardId = input<number | null>(null);

  readonly cardInspect = output<DecklistCard>();
  readonly cardRemove = output<DeckCardRemoveEvent>();
  readonly cardMove = output<DeckCardMoveEvent>();

  protected readonly sectionKeys = DECK_SECTION_KEYS;
  protected readonly verdictBannerClass = verdictBannerClass;
  protected readonly canPlaceCardInSection = canPlaceCardInSection;
  protected readonly activeDropSection = signal<DeckSectionKey | null>(null);
  protected readonly moveMenu = signal<{ card: DecklistCard; from: DeckSectionKey } | null>(null);

  /** Delay so vertical scroll still works on phones before a drag starts. */
  protected readonly dragStartDelayMs = 160;

  protected readonly canEnterSection = (
    drag: CdkDrag<DecklistCard>,
    drop: CdkDropList<DeckSectionKey>,
  ): boolean => canPlaceCardInSection(drag.data.type, drop.data);

  onDrop(event: CdkDragDrop<DeckSectionKey, DeckSectionKey, DecklistCard>): void {
    this.activeDropSection.set(null);
    if (event.previousContainer === event.container) {
      return;
    }
    const card = event.item.data;
    const from = event.previousContainer.data;
    const to = event.container.data;
    if (!card || from === to) {
      return;
    }
    this.cardMove.emit({ cardId: card.id, from, to });
  }

  onDragStarted(from: DeckSectionKey): void {
    this.activeDropSection.set(from);
  }

  onDragEnded(): void {
    this.activeDropSection.set(null);
  }

  clearDropTarget(section: DeckSectionKey): void {
    if (this.activeDropSection() === section) {
      this.activeDropSection.set(null);
    }
  }

  isDropTarget(section: DeckSectionKey): boolean {
    const active = this.activeDropSection();
    return active != null && active !== section;
  }

  openMoveMenu(card: DecklistCard, from: DeckSectionKey, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.moveMenu.set({ card, from });
  }

  closeMoveMenu(): void {
    this.moveMenu.set(null);
  }

  confirmMove(to: DeckSectionKey): void {
    const menu = this.moveMenu();
    if (!menu || menu.from === to) {
      return;
    }
    this.cardMove.emit({ cardId: menu.card.id, from: menu.from, to });
    this.moveMenu.set(null);
  }

  sectionTitleKey(key: DeckSectionKey): string {
    return `decklist.editor.${key}`;
  }
}
