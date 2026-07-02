import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Decklist } from '../../models/decklist.model';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../stores/decklist.store';

@Component({
  selector: 'app-decklist-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="flex flex-col min-h-0 gap-4">
      @if (decklistStore.feedback(); as fb) {
        <div class="alert alert-sm py-2 text-xs" [class]="feedbackClass(fb.tone)">
          <span>{{ feedbackMessage(fb) }}</span>
        </div>
      }

      @if (createOpen()) {
        <div class="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p class="font-semibold">{{ i18n.t('decklist.create.title') }}</p>
          <input
            type="text"
            class="input input-bordered w-full"
            [placeholder]="i18n.t('decklist.create.placeholder')"
            [ngModel]="newDeckName()"
            (ngModelChange)="newDeckName.set($event)"
            (keydown.enter)="submitCreateDeck()"
          />
          <div class="flex gap-2 justify-end">
            <button type="button" class="btn btn-ghost btn-sm" (click)="cancelCreateDeck()">
              {{ i18n.t('decklist.dialog.cancel') }}
            </button>
            <button type="button" class="btn btn-primary btn-sm" (click)="submitCreateDeck()">
              {{ i18n.t('decklist.create.confirm') }}
            </button>
          </div>
        </div>
      }

      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/70">
          {{ i18n.t('decklist.decksTitle') }}
        </h2>
        <button
          type="button"
          class="btn btn-primary btn-sm gap-1"
          (click)="openCreateDeck()"
        >
          + {{ i18n.t('decklist.create.button') }}
        </button>
      </div>

      <div class="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
        @for (deck of decklistStore.decklists(); track deck.id) {
          <button
            type="button"
            class="snap-start shrink-0 w-36 sm:w-44 rounded-xl border-2 p-3 text-left transition-all hover:shadow-md"
            [class.border-primary]="deck.id === decklistStore.activeDecklistId()"
            [class.bg-primary/10]="deck.id === decklistStore.activeDecklistId()"
            [class.border-base-300]="deck.id !== decklistStore.activeDecklistId()"
            [class.bg-base-100]="deck.id !== decklistStore.activeDecklistId()"
            (click)="decklistStore.setActiveDecklist(deck.id)"
          >
            <p class="font-semibold text-sm truncate">{{ deck.name }}</p>
            <p class="text-xs text-base-content/60 mt-1">
              {{ deckStatsLabel(deck) }}
            </p>
          </button>
        }
      </div>

      @if (decklistStore.activeDecklist(); as deck) {
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-4 sm:p-5 gap-4">
            <div class="flex flex-col sm:flex-row sm:items-end gap-3">
              <label class="form-control flex-1 min-w-0">
                <span class="label py-0 mb-1">
                  <span class="label-text font-medium">{{ i18n.t('decklist.rename') }}</span>
                </span>
                <input
                  type="text"
                  class="input input-bordered w-full"
                  [ngModel]="renameDraft()"
                  (ngModelChange)="renameDraft.set($event)"
                  (keydown.enter)="commitRename()"
                />
              </label>
              <div class="flex gap-2 shrink-0">
                <button type="button" class="btn btn-primary btn-sm" (click)="commitRename()">
                  {{ i18n.t('decklist.renameSave') }}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm text-error"
                  (click)="decklistStore.deleteActiveDecklist()"
                >
                  {{ i18n.t('decklist.delete') }}
                </button>
              </div>
            </div>

            <div class="flex flex-wrap gap-3 text-xs sm:text-sm text-base-content/70 border-y border-base-300 py-3">
              <span>{{ i18n.t('decklist.stats.total', { count: '' + decklistStore.totalCardsForDeck(deck.id) }) }}</span>
              <span>{{ i18n.t('decklist.stats.unique', { count: '' + decklistStore.uniqueCardsForDeck(deck.id) }) }}</span>
            </div>

            @if (deck.cards.length === 0) {
              <div class="text-center py-10 px-4 rounded-xl bg-base-200/40 border border-dashed border-base-300">
                <p class="text-sm text-base-content/60">{{ i18n.t('decklist.empty') }}</p>
              </div>
            } @else {
              <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                @for (card of deck.cards; track card.id) {
                  <article
                    class="flex gap-3 p-3 rounded-xl border border-base-300 bg-base-200/30 hover:bg-base-200/60 transition-colors"
                  >
                    @if (card.imageUrlSmall; as src) {
                      <img
                        [src]="src"
                        [alt]=""
                        class="w-12 h-[4.25rem] object-cover rounded-lg shadow shrink-0"
                        loading="lazy"
                      />
                    } @else {
                      <span class="w-12 h-[4.25rem] rounded-lg bg-base-300 shrink-0"></span>
                    }
                    <div class="flex-1 min-w-0 flex flex-col gap-2">
                      <div>
                        <p class="font-semibold text-sm leading-snug line-clamp-2">{{ card.name }}</p>
                        <p class="text-xs text-base-content/60 truncate">{{ card.type }}</p>
                      </div>
                      <div class="flex items-center justify-between gap-1 mt-auto">
                        <div class="join">
                          <button
                            type="button"
                            class="btn btn-xs join-item"
                            (click)="decklistStore.decrementCard(card.id)"
                          >
                            −
                          </button>
                          <span class="btn btn-xs join-item btn-disabled tabular-nums no-animation">
                            ×{{ card.quantity }}
                          </span>
                          <button
                            type="button"
                            class="btn btn-xs join-item"
                            (click)="decklistStore.incrementCard(card.id)"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs text-error"
                          [attr.aria-label]="i18n.t('decklist.removeCard')"
                          (click)="decklistStore.removeCard(card.id)"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </article>
                }
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class DecklistPanelComponent {
  readonly fullPage = input(false);

  protected readonly decklistStore = inject(DecklistStore);
  protected readonly i18n = inject(I18nService);

  readonly renameDraft = signal('');
  readonly createOpen = signal(false);
  readonly newDeckName = signal('');

  constructor() {
    effect(() => {
      this.renameDraft.set(this.decklistStore.activeDecklist()?.name ?? '');
    });
  }

  deckStatsLabel(deck: Decklist): string {
    return this.i18n.t('decklist.deckCardCount', {
      total: `${this.decklistStore.totalCardsForDeck(deck.id)}`,
      unique: `${this.decklistStore.uniqueCardsForDeck(deck.id)}`,
    });
  }

  commitRename(): void {
    this.decklistStore.renameActiveDecklist(this.renameDraft());
  }

  openCreateDeck(): void {
    this.newDeckName.set('');
    this.createOpen.set(true);
  }

  cancelCreateDeck(): void {
    this.createOpen.set(false);
    this.newDeckName.set('');
  }

  submitCreateDeck(): void {
    const name = this.newDeckName().trim();
    if (!name) {
      return;
    }
    this.decklistStore.createDecklist(name);
    this.createOpen.set(false);
    this.newDeckName.set('');
  }

  feedbackMessage(fb: { key: string; params?: Record<string, string> }): string {
    return this.i18n.t(fb.key, fb.params);
  }

  feedbackClass(tone: string): string {
    switch (tone) {
      case 'success':
        return 'alert-success';
      case 'warning':
        return 'alert-warning';
      default:
        return 'alert-info';
    }
  }
}
