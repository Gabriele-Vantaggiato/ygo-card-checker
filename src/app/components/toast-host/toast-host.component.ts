import { Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  template: `
    <div class="toast-host" aria-live="polite" aria-atomic="true">
      @for (item of toast.messages(); track item.id) {
        <div
          class="alert shadow-lg border pointer-events-auto"
          [class.alert-success]="item.type === 'success'"
          [class.alert-error]="item.type === 'error'"
          [class.alert-info]="item.type === 'info'"
        >
          <span>{{ item.message }}</span>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-circle"
            aria-label="Close"
            (click)="toast.dismiss(item.id)"
          >
            ✕
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toast = inject(ToastService);
}
