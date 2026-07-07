import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Decklist } from '../../models/decklist.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-decklist-editor-header',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="duel-panel px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
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
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn btn-primary btn-sm" (click)="completeDeck.emit()">
          {{ 'decklist.completeDeck' | translate }}
        </button>
        <div class="join hidden sm:inline-flex">
          <button type="button" class="btn btn-outline btn-sm join-item" (click)="importText.emit()">
            {{ 'decklist.importText' | translate }}
          </button>
          <button type="button" class="btn btn-outline btn-sm join-item" (click)="exportText.emit()">
            {{ 'decklist.exportText' | translate }}
          </button>
          <button type="button" class="btn btn-outline btn-sm join-item" (click)="importYdke.emit()">
            {{ 'decklist.importYdke' | translate }}
          </button>
          <button type="button" class="btn btn-outline btn-sm join-item" (click)="exportYdke.emit()">
            {{ 'decklist.exportYdke' | translate }}
          </button>
        </div>
        <div class="dropdown dropdown-end sm:hidden">
          <button type="button" tabindex="0" class="btn btn-outline btn-sm">
            {{ 'decklist.toolbar.more' | translate }}
          </button>
          <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-50 w-44 p-2 shadow-lg border border-base-300">
            <li><button type="button" (click)="importText.emit()">{{ 'decklist.importText' | translate }}</button></li>
            <li><button type="button" (click)="exportText.emit()">{{ 'decklist.exportText' | translate }}</button></li>
            <li><button type="button" (click)="importYdke.emit()">{{ 'decklist.importYdke' | translate }}</button></li>
            <li><button type="button" (click)="exportYdke.emit()">{{ 'decklist.exportYdke' | translate }}</button></li>
            <li><button type="button" (click)="sortDeck.emit()">{{ 'decklist.editor.sort' | translate }}</button></li>
            <li><button type="button" class="text-error" (click)="deleteDeck.emit()">{{ 'decklist.delete' | translate }}</button></li>
          </ul>
        </div>
        <button type="button" class="btn btn-ghost btn-sm hidden sm:inline-flex" (click)="sortDeck.emit()">
          {{ 'decklist.editor.sort' | translate }}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm text-error hidden sm:inline-flex ml-auto"
          (click)="deleteDeck.emit()"
        >
          {{ 'decklist.delete' | translate }}
        </button>
      </div>
    </header>
  `,
})
export class DecklistEditorHeaderComponent {
  readonly deck = input.required<Decklist>();
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
