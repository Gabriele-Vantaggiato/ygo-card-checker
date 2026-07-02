import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../stores/decklist.store';

@Component({
  selector: 'app-decklist-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="flex flex-col min-h-0 border-t border-base-300 pt-4">
      <div class="flex items-center justify-between gap-2 mb-2">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/80">
          {{ i18n.t('decklist.title') }}
        </h3>
        <span class="text-xs text-base-content/50">
          {{ i18n.t('decklist.total', { count: '' + decklistStore.activeTotalCards() }) }}
        </span>
      </div>

      @if (decklistStore.feedback(); as fb) {
        <div class="alert alert-sm py-2 mb-2 text-xs" [class]="feedbackClass(fb)">
          <span>{{ i18n.t('decklist.feedback.' + fb) }}</span>
        </div>
      }

      <div class="flex flex-wrap gap-2 mb-3">
        <select
          class="select select-bordered select-sm flex-1 min-w-0"
          [ngModel]="decklistStore.activeDecklistId()"
          (ngModelChange)="decklistStore.setActiveDecklist($event)"
        >
          @for (deck of decklistStore.decklists(); track deck.id) {
            <option [ngValue]="deck.id">{{ deck.name }}</option>
          }
        </select>
        <button type="button" class="btn btn-primary btn-sm btn-square" (click)="decklistStore.createDecklist()">
          +
        </button>
      </div>

      @if (decklistStore.activeDecklist(); as deck) {
        <div class="flex gap-2 mb-3">
          <input
            type="text"
            class="input input-bordered input-sm flex-1 min-w-0"
            [ngModel]="renameDraft()"
            (ngModelChange)="renameDraft.set($event)"
            (keydown.enter)="commitRename()"
          />
          <button type="button" class="btn btn-ghost btn-sm" (click)="commitRename()">
            {{ i18n.t('decklist.rename') }}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm text-error"
            [attr.aria-label]="i18n.t('decklist.delete')"
            (click)="decklistStore.deleteActiveDecklist()"
          >
            {{ i18n.t('decklist.delete') }}
          </button>
        </div>

        @if (deck.cards.length === 0) {
          <p class="text-xs text-base-content/50 py-2">{{ i18n.t('decklist.empty') }}</p>
        } @else {
          <ul class="menu menu-sm bg-base-200/60 rounded-box border border-base-300 p-1 gap-0.5 max-h-48 overflow-y-auto">
            @for (card of deck.cards; track card.id) {
              <li>
                <div class="flex w-full items-center gap-2 py-1.5 px-1">
                  @if (card.imageUrlSmall; as src) {
                    <img [src]="src" [alt]="" class="w-6 h-8 object-cover rounded shrink-0" loading="lazy" />
                  } @else {
                    <span class="w-6 h-8 rounded bg-base-300 shrink-0"></span>
                  }
                  <span class="flex-1 min-w-0 text-left">
                    <span class="block text-xs font-medium truncate">{{ card.name }}</span>
                    <span class="block text-[10px] opacity-60 truncate">{{ card.type }}</span>
                  </span>
                  <div class="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square"
                      (click)="decklistStore.decrementCard(card.id)"
                    >
                      −
                    </button>
                    <span class="text-xs w-4 text-center tabular-nums">{{ card.quantity }}</span>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square"
                      (click)="decklistStore.incrementCard(card.id)"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square text-error"
                      [attr.aria-label]="i18n.t('decklist.removeCard')"
                      (click)="decklistStore.removeCard(card.id)"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class DecklistPanelComponent {
  protected readonly decklistStore = inject(DecklistStore);
  protected readonly i18n = inject(I18nService);

  readonly renameDraft = signal('');

  constructor() {
    effect(() => {
      this.renameDraft.set(this.decklistStore.activeDecklist()?.name ?? '');
    });
  }

  commitRename(): void {
    this.decklistStore.renameActiveDecklist(this.renameDraft());
  }

  feedbackClass(feedback: string): string {
    switch (feedback) {
      case 'added':
        return 'alert-success';
      case 'forbidden':
      case 'maxReached':
        return 'alert-warning';
      default:
        return 'alert-info';
    }
  }
}
