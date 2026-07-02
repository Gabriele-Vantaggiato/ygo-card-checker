import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../stores/decklist.store';

@Component({
  selector: 'app-decklist-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section
      class="flex flex-col min-h-0"
      [class.border-t]="!fullPage()"
      [class.border-base-300]="!fullPage()"
      [class.pt-4]="!fullPage()"
    >
      <div class="flex items-center justify-between gap-2 mb-3">
        @if (!fullPage()) {
          <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/80">
            {{ i18n.t('decklist.title') }}
          </h3>
        } @else {
          <span></span>
        }
        <span class="text-xs sm:text-sm text-base-content/50">
          {{ totalLabel() }}
        </span>
      </div>

      @if (decklistStore.feedback(); as fb) {
        <div class="alert alert-sm py-2 mb-2 text-xs" [class]="feedbackClass(fb.tone)">
          <span>{{ feedbackMessage(fb) }}</span>
        </div>
      }

      @if (createOpen()) {
        <div class="rounded-lg border border-primary/30 bg-primary/5 p-3 mb-4 space-y-2">
          <p class="text-sm font-medium">{{ i18n.t('decklist.create.title') }}</p>
          <input
            type="text"
            class="input input-bordered input-sm w-full"
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

      <div class="flex flex-wrap gap-2 mb-4">
        <select
          class="select select-bordered flex-1 min-w-0"
          [class.select-sm]="!fullPage()"
          [ngModel]="decklistStore.activeDecklistId()"
          (ngModelChange)="decklistStore.setActiveDecklist($event)"
        >
          @for (deck of decklistStore.decklists(); track deck.id) {
            <option [ngValue]="deck.id">{{ deck.name }}</option>
          }
        </select>
        <button
          type="button"
          class="btn btn-primary btn-square"
          [class.btn-sm]="!fullPage()"
          [attr.aria-label]="i18n.t('decklist.create.button')"
          (click)="openCreateDeck()"
        >
          +
        </button>
      </div>

      @if (decklistStore.activeDecklist(); as deck) {
        <div class="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="text"
            class="input input-bordered flex-1 min-w-0"
            [class.input-sm]="!fullPage()"
            [ngModel]="renameDraft()"
            (ngModelChange)="renameDraft.set($event)"
            (keydown.enter)="commitRename()"
          />
          <button
            type="button"
            class="btn btn-ghost"
            [class.btn-sm]="!fullPage()"
            (click)="commitRename()"
          >
            {{ i18n.t('decklist.rename') }}
          </button>
          <button
            type="button"
            class="btn btn-ghost text-error"
            [class.btn-sm]="!fullPage()"
            [attr.aria-label]="i18n.t('decklist.delete')"
            (click)="decklistStore.deleteActiveDecklist()"
          >
            {{ i18n.t('decklist.delete') }}
          </button>
        </div>

        @if (deck.cards.length === 0) {
          <p class="text-sm text-base-content/50 py-4 text-center">{{ i18n.t('decklist.empty') }}</p>
        } @else {
          <ul
            class="menu bg-base-200/60 rounded-box border border-base-300 p-1 gap-1 overflow-y-auto"
            [class.menu-sm]="!fullPage()"
            [class.max-h-48]="!fullPage()"
            [class.max-h-[min(32rem,calc(100vh-18rem))]]="fullPage()"
          >
            @for (card of deck.cards; track card.id) {
              <li>
                <div class="flex w-full items-center gap-3 py-2 px-2">
                  @if (card.imageUrlSmall; as src) {
                    <img
                      [src]="src"
                      [alt]=""
                      class="object-cover rounded shrink-0"
                      [class]="fullPage() ? 'w-10 h-14' : 'w-6 h-8'"
                      loading="lazy"
                    />
                  } @else {
                    <span class="w-6 h-8 rounded bg-base-300 shrink-0"></span>
                  }
                  <span class="flex-1 min-w-0 text-left">
                    <span class="block font-medium truncate" [class.text-xs]="!fullPage()" [class.text-sm]="fullPage()">
                      {{ card.name }}
                    </span>
                    <span class="block opacity-60 truncate" [class.text-[10px]]="!fullPage()" [class.text-xs]="fullPage()">
                      {{ card.type }}
                    </span>
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

  totalLabel(): string {
    return this.i18n.t('decklist.total', {
      count: `${this.decklistStore.activeTotalCards()}`,
    });
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
