import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { I18nService } from '../../services/i18n.service';
import { DeckStrategyStore } from '../../stores/deck-strategy.store';
import { DeckCompletionDirection } from '../../utils/completion-prompt.utils';

@Component({
  selector: 'app-deck-strategy-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <details class="duel-panel group" [attr.open]="defaultOpen() ? true : null">
      <summary
        class="px-3 py-2.5 sm:px-4 sm:py-3 border-b border-base-300/70 cursor-pointer list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
      >
        <span class="flex items-center gap-2 min-w-0">
          <span class="text-primary/80 transition-transform group-open:rotate-90 shrink-0" aria-hidden="true">›</span>
          <span class="truncate text-sm font-semibold text-base-content/80">
            {{ i18n.t('strategy.title') }}
          </span>
        </span>
        @if (ragResult()?.summary; as summary) {
          <span class="badge badge-primary badge-xs font-normal truncate max-w-[45%] hidden sm:inline-flex">
            {{ summary }}
          </span>
        }
      </summary>

      <div class="p-3 sm:p-4 space-y-3">
        <p class="text-xs text-base-content/55 leading-relaxed">{{ i18n.t('strategy.hint') }}</p>

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
              <span class="text-xs leading-tight">{{ i18n.t(option.labelKey) }}</span>
            </label>
          }
        </div>

        <label class="form-control">
          <span class="label-text text-xs text-base-content/60">{{ i18n.t('strategy.prompt') }}</span>
          <textarea
            class="textarea textarea-bordered textarea-sm min-h-14"
            [placeholder]="i18n.t('strategy.promptPlaceholder')"
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
            <span class="label-text">{{ i18n.t('decklist.completion.useOllama') }}</span>
          </label>
          @if (strategy.ollamaAvailable() === true) {
            <span class="badge badge-success badge-xs">{{ i18n.t('decklist.completion.ollamaOnline') }}</span>
          } @else if (strategy.ollamaAvailable() === false) {
            <span class="badge badge-ghost badge-xs">{{ i18n.t('decklist.completion.ollamaOffline') }}</span>
          }
        </div>
      </div>
    </details>
  `,
})
export class DeckStrategyPanelComponent {
  readonly defaultOpen = input(false);

  readonly i18n = inject(I18nService);
  readonly strategy = inject(DeckStrategyStore);
  readonly ragResult = toSignal(this.strategy.ragResult$);

  readonly directions: Array<{ id: DeckCompletionDirection; labelKey: string }> = [
    { id: 'archetype', labelKey: 'decklist.completion.dir.archetype' },
    { id: 'combo', labelKey: 'decklist.completion.dir.combo' },
    { id: 'staples', labelKey: 'decklist.completion.dir.staples' },
    { id: 'side_meta', labelKey: 'decklist.completion.dir.sideMeta' },
  ];
}
