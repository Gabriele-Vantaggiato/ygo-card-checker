import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { CardDecisionService } from '../../services/decision/card-decision.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-card-decision-options',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="border border-base-300 rounded-lg p-3 space-y-2 my-3">
      <label class="flex items-center gap-2 cursor-pointer">
        <input #enabled type="checkbox" class="checkbox checkbox-sm checkbox-primary"
          [checked]="model.preferences().enabled"
          (change)="update(enabled.checked, model.preferences().prompt)" />
        <span class="text-sm font-medium">{{ 'decision.title' | translate }}</span>
      </label>
      <p class="text-xs text-base-content/60">{{ 'decision.hint' | translate }}</p>
      @if (model.preferences().enabled) {
        <label class="block space-y-1">
          <span class="text-xs">{{ 'decision.goal' | translate }}</span>
          <textarea #goal class="textarea textarea-sm w-full" rows="2" maxlength="500"
            [value]="model.preferences().prompt" [placeholder]="'decision.placeholder' | translate"
            (change)="update(true, goal.value)"></textarea>
        </label>
        <p class="text-xs text-base-content/60" role="status" aria-live="polite">
          {{ ('decision.status.' + model.status()) | translate }}
        </p>
      }
    </fieldset>
  `,
})
export class CardDecisionOptionsComponent {
  readonly model = inject(CardDecisionService);
  readonly changed = output<void>();
  update(enabled: boolean, prompt: string): void {
    this.model.setPreferences(enabled, prompt);
    this.changed.emit();
  }
}
