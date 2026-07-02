import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { DecklistEditorComponent } from '../decklist-editor/decklist-editor.component';
import { DecklistGridComponent } from '../decklist-grid/decklist-grid.component';
import { DeckFeedbackBannerComponent } from '../deck-feedback-banner/deck-feedback-banner.component';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../stores/decklist.store';

type DecklistView = 'grid' | 'editor';

@Component({
  selector: 'app-decklist-panel',
  standalone: true,
  imports: [FormsModule, DecklistGridComponent, DecklistEditorComponent, DeckFeedbackBannerComponent],
  template: `
    <section class="flex flex-col min-h-0 gap-4">
      <app-deck-feedback-banner
        [message]="decklistStore.feedback()"
        (dismiss)="decklistStore.clearFeedback()"
      />

      @if (createOpen()) {
        <dialog class="modal modal-open" open>
          <div class="modal-box duel-modal">
            <h3 class="font-bold text-lg">{{ i18n.t('decklist.create.title') }}</h3>
            <input
              type="text"
              class="input input-bordered w-full mt-4"
              [placeholder]="i18n.t('decklist.create.placeholder')"
              [ngModel]="newDeckName()"
              (ngModelChange)="newDeckName.set($event)"
              (keydown.enter)="submitCreateDeck()"
            />
            <div class="modal-action">
              <button type="button" class="btn btn-ghost" (click)="cancelCreateDeck()">
                {{ i18n.t('decklist.dialog.cancel') }}
              </button>
              <button type="button" class="btn btn-primary" (click)="submitCreateDeck()">
                {{ i18n.t('decklist.create.confirm') }}
              </button>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button type="button" (click)="cancelCreateDeck()">close</button>
          </form>
        </dialog>
      }

      @if (view() === 'grid') {
        <app-decklist-grid
          (deckSelected)="openEditor($event)"
          (createRequested)="openCreateDeck()"
        />
      } @else if (decklistStore.activeDecklist(); as deck) {
        <app-decklist-editor
          [deck]="deck"
          [focusCardId]="focusCardId()"
          (back)="closeEditor()"
        />
      }
    </section>
  `,
})
export class DecklistPanelComponent {
  protected readonly decklistStore = inject(DecklistStore);
  protected readonly i18n = inject(I18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly view = signal<DecklistView>('grid');
  readonly createOpen = signal(false);
  readonly newDeckName = signal('');
  readonly focusCardId = signal<number | null>(null);

  constructor() {
    this.route.queryParamMap
      .pipe(
        map((params) => ({
          deckId: params.get('deckId'),
          cardId: params.get('cardId'),
          editor: params.get('editor'),
        })),
        filter(({ deckId, editor }) => !!deckId && editor === '1'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ deckId, cardId }) => {
        if (!deckId || !this.decklistStore.getDeckById(deckId)) {
          return;
        }
        this.decklistStore.setActiveDecklist(deckId);
        this.view.set('editor');
        if (cardId && /^\d+$/.test(cardId)) {
          this.focusCardId.set(Number(cardId));
        }
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { deckId: null, cardId: null, editor: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
  }

  openEditor(deckId: string): void {
    this.focusCardId.set(null);
    this.decklistStore.setActiveDecklist(deckId);
    this.view.set('editor');
  }

  closeEditor(): void {
    this.focusCardId.set(null);
    this.view.set('grid');
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
    const id = this.decklistStore.createDecklist(name || undefined);
    this.createOpen.set(false);
    this.newDeckName.set('');
    this.openEditor(id);
  }
}
