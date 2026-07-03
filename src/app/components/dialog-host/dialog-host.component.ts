import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AddToDecklistDialogComponent } from '../add-to-decklist-dialog/add-to-decklist-dialog.component';
import { DialogService } from '../../services/dialog.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dialog-host',
  standalone: true,
  imports: [AddToDecklistDialogComponent],
  template: `
    @if (dialog.active(); as req) {
      <div class="dialog-layer" role="presentation" (click)="dialog.close()">
        <div (click)="$event.stopPropagation()">
          @switch (req.type) {
            @case ('add-to-decklist') {
              <app-add-to-decklist-dialog
                [payload]="req.payload"
                [banlistStatus]="req.banlistStatus"
                (closed)="dialog.close()"
              />
            }
          }
        </div>
      </div>
    }
  `,
})
export class DialogHostComponent {
  protected readonly dialog = inject(DialogService);
}
