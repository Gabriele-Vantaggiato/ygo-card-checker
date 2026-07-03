import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-duel-modal',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  @if (open()) {
    <dialog class="modal modal-open" [attr.aria-label]="ariaLabel()">
      <div class="duel-modal w-full max-w-lg">
        @if (titleKey()) {
          <h3 class="font-bold text-lg">{{ titleKey()! | translate }}</h3>
        }
        <ng-content />
        @if (showClose()) {
          <div class="modal-action mt-4">
            <button type="button" class="btn btn-ghost btn-sm" (click)="closed.emit()">
              {{ closeKey() | translate }}
            </button>
          </div>
        }
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" (click)="closed.emit()">close</button>
      </form>
    </dialog>
  }
  `,
})
export class DuelModalComponent {
  readonly open = input(false);
  readonly titleKey = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly showClose = input(true);
  readonly closeKey = input('common.close');

  readonly closed = output<void>();
}
