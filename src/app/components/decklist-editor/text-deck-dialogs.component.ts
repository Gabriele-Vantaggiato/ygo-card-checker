import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-text-deck-export-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <dialog class="modal modal-open" open>
        <div class="modal-box duel-modal max-w-2xl">
          <h3 class="font-bold text-lg">{{ 'decklist.text.exportTitle' | translate }}</h3>
          <p class="text-sm text-base-content/60 mt-1">{{ hint() }}</p>
          <textarea
            class="textarea textarea-bordered w-full mt-4 font-mono text-sm leading-relaxed min-h-48"
            readonly
            [value]="text()"
            (focus)="selectText.emit($event)"
          ></textarea>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost" (click)="closed.emit()">
              {{ 'decklist.text.close' | translate }}
            </button>
            <button type="button" class="btn btn-primary" [disabled]="!text().trim()" (click)="copy.emit()">
              {{ 'decklist.text.copy' | translate }}
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="closed.emit()">close</button>
        </form>
      </dialog>
    }
  `,
})
export class TextDeckExportDialogComponent {
  readonly open = input(false);
  readonly text = input('');
  readonly hint = input('');

  readonly closed = output<void>();
  readonly copy = output<void>();
  readonly selectText = output<FocusEvent>();
}

@Component({
  selector: 'app-text-deck-import-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <dialog class="modal modal-open" open>
        <div class="modal-box duel-modal max-w-2xl">
          <h3 class="font-bold text-lg">{{ 'decklist.text.importTitle' | translate }}</h3>
          <p class="text-sm text-base-content/60 mt-1">{{ 'decklist.text.importHint' | translate }}</p>
          <textarea
            class="textarea textarea-bordered w-full mt-4 font-mono text-sm leading-relaxed min-h-48"
            [ngModel]="draft()"
            (ngModelChange)="draftChange.emit($event)"
            [placeholder]="'decklist.text.importPlaceholder' | translate"
          ></textarea>
          @if (preview(); as counts) {
            <p class="text-xs text-base-content/60 mt-2">
              {{ 'decklist.text.hint' | translate: counts }}
            </p>
          }
          @if (unresolved().length > 0) {
            <div class="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
              <p class="text-xs font-medium text-warning">{{ 'decklist.text.unresolvedTitle' | translate }}</p>
              <ul class="mt-1 text-xs text-base-content/70 list-disc list-inside">
                @for (name of unresolved(); track name) {
                  <li>{{ name }}</li>
                }
              </ul>
            </div>
          }
          <label class="label cursor-pointer justify-start gap-3 mt-3">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              [ngModel]="replace()"
              (ngModelChange)="replaceChange.emit($event)"
            />
            <span class="label-text">{{ 'decklist.text.importReplace' | translate }}</span>
          </label>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost" (click)="closed.emit()">
              {{ 'decklist.dialog.cancel' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!draft().trim() || importing()"
              (click)="confirm.emit()"
            >
              @if (importing()) {
                <span class="loading loading-spinner loading-xs"></span>
              }
              {{ 'decklist.text.importConfirm' | translate }}
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="closed.emit()">close</button>
        </form>
      </dialog>
    }
  `,
})
export class TextDeckImportDialogComponent {
  readonly open = input(false);
  readonly draft = input('');
  readonly replace = input(true);
  readonly importing = input(false);
  readonly preview = input<{ main: string; extra: string; side: string } | null>(null);
  readonly unresolved = input<string[]>([]);

  readonly draftChange = output<string>();
  readonly replaceChange = output<boolean>();
  readonly closed = output<void>();
  readonly confirm = output<void>();
}
