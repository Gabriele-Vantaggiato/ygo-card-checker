import { Component, inject } from '@angular/core';
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
    <details class="rounded-xl border border-base-300/80 bg-base-200/30 open:bg-base-200/50">
      <summary class="cursor-pointer px-3 py-2.5 text-sm font-semibold">
        {{ i18n.t('strategy.title') }}
        @if (ragResult()?.summary) {
          <span class="ml-2 text-xs font-normal text-primary">· {{ ragResult()!.summary }}</span>
        }
      </summary>

      <div class="px-3 pb-3 space-y-3 border-t border-base-300/60 pt-3">
        <p class="text-xs text-base-content/60">{{ i18n.t('strategy.hint') }}</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          @for (option of directions; track option.id) {
            <label class="label cursor-pointer justify-start gap-2 rounded-lg border border-base-300/60 px-2 py-1.5">
              <input
                type="radio"
                class="radio radio-primary radio-xs"
                name="strategyDirection"
                [checked]="strategy.direction() === option.id"
                (change)="strategy.setDirection(option.id)"
              />
              <span class="label-text text-xs">{{ i18n.t(option.labelKey) }}</span>
            </label>
          }
        </div>

        <label class="form-control">
          <span class="label-text text-xs">{{ i18n.t('strategy.prompt') }}</span>
          <textarea
            class="textarea textarea-bordered textarea-sm min-h-16"
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
          @if (ragResult()?.ollamaUsed) {
            <span class="badge badge-primary badge-xs">{{ i18n.t('decklist.completion.ollamaUsed') }}</span>
          }
        </div>
      </div>
    </details>
  `,
})
export class DeckStrategyPanelComponent {
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
