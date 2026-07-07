import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../services/i18n.service';
import { DeckStrategyStore } from '../../features/decklist/stores/deck-strategy.store';
import { DeckCompletionDirection } from '../../utils/completion-prompt.utils';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DuelCollapseComponent } from '../../shared/ui/duel-collapse/duel-collapse.component';
@Component({
  selector: 'app-deck-strategy-panel',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DuelCollapseComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-duel-collapse titleKey="strategy.title" [open]="defaultOpen()" [compactHeader]="true">
      @if (strategy.ragResult().summary; as summary) {
        <span summary-extra class="badge badge-primary badge-xs font-normal truncate max-w-[45%] hidden sm:inline-flex">
          {{ summary }}
        </span>
      }

      <p class="text-xs text-base-content/55 leading-relaxed">{{ 'strategy.hint' | translate }}</p>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
          @for (option of directions; track option.id) {
            <label
              class="flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors"
              [class.border-primary]="strategy.direction() === option.id"
              [class.bg-primary/10]="strategy.direction() === option.id"
              [class.border-base-300/60]="strategy.direction() !== option.id"
            >
              <input
                type="radio"
                class="radio radio-primary radio-xs"
                name="strategyDirection"
                [checked]="strategy.direction() === option.id"
                (change)="strategy.setDirection(option.id)"
              />
              <span class="text-xs leading-tight">{{ (option.labelKey) | translate }}</span>
            </label>
          }
        </div>

        <label class="form-control">
          <span class="label-text text-xs text-base-content/60">{{ 'strategy.prompt' | translate }}</span>
          <textarea
            class="textarea textarea-bordered textarea-sm min-h-14"
            [placeholder]="'strategy.promptPlaceholder' | translate"
            [ngModel]="strategy.prompt()"
            (ngModelChange)="strategy.setPrompt($event)"
          ></textarea>
        </label>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <label class="label cursor-pointer gap-2 py-0">
            <input
              type="checkbox"
              class="checkbox checkbox-xs checkbox-primary"
              [ngModel]="strategy.useOllama()"
              (ngModelChange)="strategy.setUseOllama($event)"
            />
            <span class="label-text">{{ 'decklist.completion.useOllama' | translate }}</span>
          </label>
          @if (strategy.ollamaAvailable() === true) {
            <span class="badge badge-success badge-xs">{{ 'decklist.completion.ollamaOnline' | translate }}</span>
          } @else if (strategy.ollamaAvailable() === false) {
            <span class="badge badge-ghost badge-xs">{{ 'decklist.completion.ollamaOffline' | translate }}</span>
          }
        </div>
    </app-duel-collapse>
  `,
})
export class DeckStrategyPanelComponent {
  readonly defaultOpen = input(false);

  readonly i18n = inject(I18nService);
  readonly strategy = inject(DeckStrategyStore);

  readonly directions: Array<{ id: DeckCompletionDirection; labelKey: string }> = [
    { id: 'archetype', labelKey: 'decklist.completion.dir.archetype' },
    { id: 'combo', labelKey: 'decklist.completion.dir.combo' },
    { id: 'staples', labelKey: 'decklist.completion.dir.staples' },
    { id: 'side_meta', labelKey: 'decklist.completion.dir.sideMeta' },
  ];
}
