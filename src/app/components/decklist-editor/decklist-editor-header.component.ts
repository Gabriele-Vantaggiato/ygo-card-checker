import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Decklist, DecklistCard } from '../../models/decklist.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DeckStatsStripComponent } from '../deck-stats-strip/deck-stats-strip.component';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';

@Component({
  selector: 'app-decklist-editor-header',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DeckStatsStripComponent, DuelPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'deck-editor-header block',
  },
  template: `
    <app-duel-panel panelClass="duel-panel-overflow-visible">
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

        <div class="dropdown dropdown-end shrink-0">
          <button
            type="button"
            tabindex="0"
            class="btn btn-ghost btn-sm btn-square"
            [attr.aria-label]="'decklist.toolbar.actions' | translate"
          >
            ⋯
          </button>
          <ul
            tabindex="0"
            class="dropdown-content menu bg-base-100 rounded-box w-44 p-2 shadow-lg border border-base-300"
          >
            <li><button type="button" (click)="sortDeck.emit()">{{ 'decklist.editor.sort' | translate }}</button></li>
            <li>
              <button type="button" class="text-error" (click)="deleteDeck.emit()">
                {{ 'decklist.delete' | translate }}
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <label class="label cursor-pointer gap-1.5 py-0 shrink-0">
          <span class="label-text text-xs">{{ 'profile.deckPublic' | translate }}</span>
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-xs"
            [checked]="isPublic()"
            (change)="publicChange.emit($any($event.target).checked)"
          />
        </label>

        <button type="button" class="btn btn-primary btn-sm" (click)="completeDeck.emit()">
          {{ 'decklist.completeDeck' | translate }}
        </button>

        <div class="dropdown dropdown-end">
          <button type="button" tabindex="0" class="btn btn-outline btn-sm gap-1.5">
            {{ 'decklist.toolbar.importExport' | translate }}
            <span class="text-base-content/40 text-xs" aria-hidden="true">▾</span>
          </button>
          <ul
            tabindex="0"
            class="dropdown-content menu bg-base-100 rounded-box w-52 p-2 shadow-lg border border-base-300"
          >
            <li class="menu-title text-xs px-2 py-1">{{ 'decklist.toolbar.listFormat' | translate }}</li>
            <li><button type="button" (click)="importText.emit()">{{ 'decklist.importText' | translate }}</button></li>
            <li><button type="button" (click)="exportText.emit()">{{ 'decklist.exportText' | translate }}</button></li>
            <li class="menu-title text-xs px-2 py-1 mt-1">{{ 'decklist.toolbar.ydkeFormat' | translate }}</li>
            <li><button type="button" (click)="importYdke.emit()">{{ 'decklist.importYdke' | translate }}</button></li>
            <li><button type="button" (click)="exportYdke.emit()">{{ 'decklist.exportYdke' | translate }}</button></li>
          </ul>
        </div>
      </div>
      </div>

      <div class="border-t border-base-300/60 px-3 py-2 sm:px-4">
        <app-deck-stats-strip [embedded]="true" [cards]="cards()" [mainTarget]="mainTarget()" />
      </div>
    </app-duel-panel>
  `,
})
export class DecklistEditorHeaderComponent {
  readonly deck = input.required<Decklist>();
  readonly cards = input.required<readonly DecklistCard[]>();
  readonly mainTarget = input(40);
  readonly renaming = input(false);
  readonly renameDraft = input('');
  readonly isPublic = input(false);

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
  readonly publicChange = output<boolean>();
}
