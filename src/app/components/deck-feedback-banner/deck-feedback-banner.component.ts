import { Component, inject, input, output } from '@angular/core';
import { DecklistFeedbackMessage } from '../../stores/decklist.store';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-deck-feedback-banner',
  standalone: true,
  template: `
    @if (message(); as fb) {
      <div
        class="alert shadow-md border text-sm py-2.5 gap-3"
        [class]="toneClass(fb.tone)"
        role="status"
      >
        <span class="flex-1 leading-snug">{{ text(fb) }}</span>
        <button type="button" class="btn btn-ghost btn-xs btn-square shrink-0" (click)="dismiss.emit()">
          ✕
        </button>
      </div>
    }
  `,
})
export class DeckFeedbackBannerComponent {
  readonly message = input<DecklistFeedbackMessage | null>(null);
  readonly dismiss = output<void>();

  private readonly i18n = inject(I18nService);

  text(fb: DecklistFeedbackMessage): string {
    return this.i18n.t(fb.key, fb.params);
  }

  toneClass(tone: DecklistFeedbackMessage['tone']): string {
    switch (tone) {
      case 'success':
        return 'alert-success border-success/30';
      case 'warning':
        return 'alert-warning border-warning/30';
      default:
        return 'alert-info border-info/30';
    }
  }
}
