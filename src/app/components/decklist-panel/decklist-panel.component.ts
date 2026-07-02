import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecklistEditorComponent } from '../decklist-editor/decklist-editor.component';
import { DecklistGridComponent } from '../decklist-grid/decklist-grid.component';
import { I18nService } from '../../services/i18n.service';
import { DecklistStore } from '../../stores/decklist.store';

type DecklistView = 'grid' | 'editor';

@Component({
  selector: 'app-decklist-panel',
  standalone: true,
  imports: [FormsModule, DecklistGridComponent, DecklistEditorComponent],
  template: `
    <section class="flex flex-col min-h-0 gap-4">
      @if (decklistStore.feedback(); as fb) {
        <div class="alert alert-sm py-2 text-xs" [class]="feedbackClass(fb.tone)">
          <span>{{ feedbackMessage(fb) }}</span>
        </div>
      }

      @if (createOpen()) {
        <dialog class="modal modal-open" open>
          <div class="modal-box">
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
        <app-decklist-editor [deck]="deck" (back)="closeEditor()" />
      }
    </section>
  `,
})
export class DecklistPanelComponent {
  protected readonly decklistStore = inject(DecklistStore);
  protected readonly i18n = inject(I18nService);

  readonly view = signal<DecklistView>('grid');
  readonly createOpen = signal(false);
  readonly newDeckName = signal('');

  openEditor(deckId: string): void {
    this.decklistStore.setActiveDecklist(deckId);
    this.view.set('editor');
  }

  closeEditor(): void {
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
