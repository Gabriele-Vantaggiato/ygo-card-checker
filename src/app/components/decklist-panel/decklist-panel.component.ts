import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { DecklistEditorComponent } from '../decklist-editor/decklist-editor.component';
import { DecklistGridComponent } from '../decklist-grid/decklist-grid.component';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../features/decklist/stores/decklist.store';

type DecklistView = 'grid' | 'editor';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-panel',
  standalone: true,
  imports: [A11yModule, FormsModule, DecklistGridComponent, DecklistEditorComponent,
    TranslatePipe],
  template: `
    <section class="flex flex-col min-h-0 gap-4">
      @if (createOpen()) {
        <dialog class="modal modal-open" open aria-modal="true" aria-labelledby="create-deck-title" (keydown.escape)="cancelCreateDeck()">
          <div class="modal-box duel-modal" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
            <h3 id="create-deck-title" class="font-display font-semibold text-2xl">{{ 'decklist.create.title' | translate }}</h3>
            <input
              cdkFocusInitial
              type="text"
              maxlength="100"
              [attr.aria-label]="'decklist.create.placeholder' | translate"
              class="input input-bordered w-full mt-4"
              [placeholder]="'decklist.create.placeholder' | translate"
              [ngModel]="newDeckName()"
              (ngModelChange)="newDeckName.set($event)"
              (keydown.enter)="submitCreateDeck()"
            />
            <div class="modal-action">
              <button type="button" class="btn btn-ghost" (click)="cancelCreateDeck()">
                {{ 'decklist.dialog.cancel' | translate }}
              </button>
              <button type="button" class="btn btn-primary" (click)="submitCreateDeck()">
                {{ 'decklist.create.confirm' | translate }}
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
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ deckId, cardId, editor }) => {
        if (!deckId || editor !== '1' || !this.decklistStore.getDeckById(deckId)) {
          this.view.set('grid');
          this.focusCardId.set(null);
          return;
        }
        this.decklistStore.setActiveDecklist(deckId);
        this.view.set('editor');
        this.focusCardId.set(cardId && /^\d+$/.test(cardId) ? Number(cardId) : null);
      });
  }

  openEditor(deckId: string): void {
    this.focusCardId.set(null);
    this.decklistStore.setActiveDecklist(deckId);
    this.view.set('editor');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { deckId, editor: '1', cardId: null }, queryParamsHandling: 'merge' });
  }

  closeEditor(): void {
    this.focusCardId.set(null);
    this.view.set('grid');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { deckId: null, editor: null, cardId: null }, queryParamsHandling: 'merge' });
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
