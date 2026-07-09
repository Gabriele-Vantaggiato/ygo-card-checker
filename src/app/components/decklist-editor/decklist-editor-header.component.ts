import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Decklist, DecklistCard } from '../../models/decklist.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DeckStatsStripComponent } from '../deck-stats-strip/deck-stats-strip.component';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';
import { DuelDropdownComponent } from '../../shared/ui/duel-dropdown/duel-dropdown.component';
import { FormatSelectorComponent } from '../format-selector/format-selector.component';
import { FormatStore } from '../../core/stores/format.store';

@Component({
  selector: 'app-decklist-editor-header',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    DeckStatsStripComponent,
    DuelPanelComponent,
    DuelDropdownComponent,
    FormatSelectorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-duel-panel>
      <div class="px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col gap-3">
        <div class="flex items-center gap-2 sm:gap-3 min-w-0">
        <button type="button" class="btn btn-ghost btn-sm btn-square shrink-0" (click)="back.emit()">
          ←
        </button>

        <div class="flex-1 min-w-0 flex items-center gap-2">
          @if (renaming()) {
            <input
              type="text"
              class="input input-bordered input-sm flex-1 min-w-0"
              [ngModel]="renameDraft()"
              (ngModelChange)="renameDraftChange.emit($event)"
              (keydown.enter)="renameCommit.emit()"
              (keydown.escape)="renameCancel.emit()"
            />
            <button type="button" class="btn btn-primary btn-sm" (click)="renameCommit.emit()">
              {{ 'decklist.renameSave' | translate }}
            </button>
          } @else {
            <h2 class="font-bold text-lg truncate tracking-tight">{{ deck().name }}</h2>
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-square shrink-0"
              [attr.aria-label]="'decklist.rename' | translate"
              (click)="renameStart.emit(deck().name)"
            >
              ✎
            </button>
          }
        </div>

        <app-duel-dropdown
          popoverId="deck-header-actions"
          anchorName="--deck-header-actions"
          align="end"
          triggerClass="btn btn-ghost btn-sm btn-square shrink-0"
          menuClass="w-44"
          [ariaLabel]="'decklist.toolbar.actions' | translate"
        >
          <span duelDropdownTrigger aria-hidden="true">⋯</span>
          <li><button type="button" (click)="sortDeck.emit()">{{ 'decklist.editor.sort' | translate }}</button></li>
          <li>
            <button type="button" class="text-error" (click)="deleteDeck.emit()">
              {{ 'decklist.delete' | translate }}
            </button>
          </li>
        </app-duel-dropdown>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn btn-primary btn-sm" (click)="completeDeck.emit()">
          {{ 'decklist.completeDeck' | translate }}
        </button>

        <app-duel-dropdown
          popoverId="deck-header-import-export"
          anchorName="--deck-header-import-export"
          align="end"
          triggerClass="btn btn-outline btn-sm gap-1.5"
          menuClass="w-52"
        >
          <span duelDropdownTrigger class="inline-flex items-center gap-1.5">
            {{ 'decklist.toolbar.importExport' | translate }}
            <span class="text-base-content/40 text-xs" aria-hidden="true">▾</span>
          </span>
          <li class="menu-title text-xs px-2 py-1">{{ 'decklist.toolbar.listFormat' | translate }}</li>
          <li><button type="button" (click)="importText.emit()">{{ 'decklist.importText' | translate }}</button></li>
          <li><button type="button" (click)="exportText.emit()">{{ 'decklist.exportText' | translate }}</button></li>
          <li class="menu-title text-xs px-2 py-1 mt-1">{{ 'decklist.toolbar.ydkeFormat' | translate }}</li>
          <li><button type="button" (click)="importYdke.emit()">{{ 'decklist.importYdke' | translate }}</button></li>
          <li><button type="button" (click)="exportYdke.emit()">{{ 'decklist.exportYdke' | translate }}</button></li>
        </app-duel-dropdown>
      </div>
      </div>

      <div class="border-t border-base-300/60 px-3 py-2 sm:px-4">
        <app-deck-stats-strip [embedded]="true" [cards]="cards()" [mainTarget]="mainTarget()" />
      </div>

      <div class="sm:hidden border-t border-base-300/60 px-3 py-2.5 sm:px-4">
        <app-format-selector
          [inline]="true"
          [showLabel]="true"
          [formats]="formatStore.formats()"
          [selectedId]="formatStore.formatId()"
          (selectedChange)="formatStore.setFormatId($event)"
        />
      </div>
    </app-duel-panel>
  `,
})
export class DecklistEditorHeaderComponent {
  protected readonly formatStore = inject(FormatStore);

  readonly deck = input.required<Decklist>();
  readonly cards = input.required<readonly DecklistCard[]>();
  readonly mainTarget = input(40);
  readonly renaming = input(false);
  readonly renameDraft = input('');

  readonly back = output<void>();
  readonly renameStart = output<string>();
  readonly renameDraftChange = output<string>();
  readonly renameCommit = output<void>();
  readonly renameCancel = output<void>();
  readonly completeDeck = output<void>();
  readonly importText = output<void>();
  readonly exportText = output<void>();
  readonly importYdke = output<void>();
  readonly exportYdke = output<void>();
  readonly sortDeck = output<void>();
  readonly deleteDeck = output<void>();
}
