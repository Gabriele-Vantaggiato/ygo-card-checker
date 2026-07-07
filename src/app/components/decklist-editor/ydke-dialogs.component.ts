import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-ydke-export-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <dialog class="modal modal-open" open>
        <div class="modal-box duel-modal max-w-2xl">
          <h3 class="font-bold text-lg">{{ 'decklist.ydke.title' | translate }}</h3>
          <p class="text-sm text-base-content/60 mt-1">{{ hint() }}</p>
          <textarea
            class="textarea textarea-bordered w-full mt-4 font-mono text-sm leading-relaxed min-h-28"
            readonly
            [value]="url()"
            (focus)="selectText.emit($event)"
          ></textarea>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost" (click)="closed.emit()">
              {{ 'decklist.ydke.close' | translate }}
            </button>
            <button type="button" class="btn btn-primary" (click)="copy.emit()">
              {{ 'decklist.ydke.copy' | translate }}
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
export class YdkeExportDialogComponent {
  readonly open = input(false);
  readonly url = input('');
  readonly hint = input('');

  readonly closed = output<void>();
  readonly copy = output<void>();
  readonly selectText = output<FocusEvent>();
}

@Component({
  selector: 'app-ydke-import-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <dialog class="modal modal-open" open>
        <div class="modal-box duel-modal max-w-2xl">
          <h3 class="font-bold text-lg">{{ 'decklist.ydke.importTitle' | translate }}</h3>
          <p class="text-sm text-base-content/60 mt-1">{{ 'decklist.ydke.importHint' | translate }}</p>
          <textarea
            class="textarea textarea-bordered w-full mt-4 font-mono text-sm leading-relaxed min-h-28"
            [ngModel]="draft()"
            (ngModelChange)="draftChange.emit($event)"
            [placeholder]="'decklist.ydke.importPlaceholder' | translate"
          ></textarea>
          @if (preview(); as counts) {
            <p class="text-xs text-base-content/60 mt-2">
              {{ 'decklist.ydke.hint' | translate: counts }}
            </p>
          }
          <label class="label cursor-pointer justify-start gap-3 mt-3">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              [ngModel]="replace()"
              (ngModelChange)="replaceChange.emit($event)"
            />
            <span class="label-text">{{ 'decklist.ydke.importReplace' | translate }}</span>
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
              {{ 'decklist.ydke.importConfirm' | translate }}
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
export class YdkeImportDialogComponent {
  readonly open = input(false);
  readonly draft = input('');
  readonly replace = input(true);
  readonly importing = input(false);
  readonly preview = input<{ main: string; extra: string; side: string } | null>(null);

  readonly draftChange = output<string>();
  readonly replaceChange = output<boolean>();
  readonly closed = output<void>();
  readonly confirm = output<void>();
}
