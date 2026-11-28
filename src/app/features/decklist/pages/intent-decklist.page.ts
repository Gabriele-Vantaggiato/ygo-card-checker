import { ChangeDetectionStrategy, Component, ElementRef, inject, isDevMode, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { Decklist } from '../../../models/decklist.model';
import { AuthService } from '../../../services/auth.service';
import { DeckSyncService } from '../../../services/deck-sync.service';
import { formatDeckText } from '../../../services/deck-text.service';

const labOrigin = 'http://127.0.0.1:4189';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page-main page-stack">
      <h1>Intent Runtime</h1>
      @if (available) {
        <details class="account-decks">
          <summary>Decklist di partenza · {{ activeName() }}</summary>
          @if (accountState() === 'signed-out') {
            <p>Accedi a YGOCC per scegliere una decklist dell’account.</p>
          } @else if (accountState() === 'loading') {
            <p>Caricamento delle decklist dell’account…</p>
          } @else if (accountState() === 'error') {
            <p>Impossibile caricare le decklist dell’account.</p>
            <button type="button" (click)="loadDecks()">Riprova</button>
          } @else if (decks().length === 0) {
            <p>L’account non contiene decklist con carte.</p>
          } @else {
            <label for="intent-source">Scegli la decklist di partenza</label>
            <select id="intent-source" #choice [value]="selectedId()" (change)="select(choice.value)">
              <option value="">Decklist di esempio</option>
              @for (deck of decks(); track deck.id) {
                <option [value]="deck.id">{{ deck.name }} · {{ deck.cards.length }} carte distinte</option>
              }
            </select>
          }
        </details>
        <iframe #lab title="Assistente decklist" src="http://127.0.0.1:4189/decklist"
          allow="microphone http://127.0.0.1:4189" (load)="sendSource()"></iframe>
      } @else {
        <p>Intent Runtime è disponibile nella versione locale di YGOCC.</p>
      }
    </main>
  `,
  styles: `
    .account-decks { padding: 1rem; border: 1px solid currentColor; border-radius: .5rem; }
    summary { cursor: pointer; }
    label { display: block; margin: .75rem 0 .25rem; }
    select { max-width: 100%; padding: .4rem; color-scheme: dark; }
    iframe { display: block; width: 100%; min-height: 86vh; border: 0; }
  `,
})
export class IntentDecklistPage {
  private readonly auth = inject(AuthService);
  private readonly deckSync = inject(DeckSyncService);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('lab');
  private loadSequence = 0;

  readonly available = isDevMode() && ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    && window.location.port === '4200';
  readonly accountState = signal<'signed-out' | 'loading' | 'ready' | 'error'>('signed-out');
  readonly decks = signal<Decklist[]>([]);
  readonly selectedId = signal('');

  constructor() {
    if (!this.available) return;
    this.auth.session$.pipe(
      map(session => session?.user.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(() => {
      this.decks.set([]);
      this.select('');
      void this.loadDecks();
    });
  }

  async loadDecks(): Promise<void> {
    const sequence = ++this.loadSequence;
    if (!this.auth.currentUser) {
      this.accountState.set('signed-out');
      return;
    }
    this.accountState.set('loading');
    try {
      const storage = await this.deckSync.load();
      if (sequence !== this.loadSequence) return;
      this.decks.set(storage.decklists.filter(deck => deck.cards.length > 0));
      this.accountState.set('ready');
    } catch {
      if (sequence === this.loadSequence) this.accountState.set('error');
    }
  }

  select(id: string): void {
    this.selectedId.set(this.decks().some(deck => deck.id === id) ? id : '');
    this.sendSource();
  }

  activeName(): string {
    return this.decks().find(deck => deck.id === this.selectedId())?.name ?? 'Esempio';
  }

  sendSource(): void {
    const deck = this.decks().find(entry => entry.id === this.selectedId());
    this.frame()?.nativeElement.contentWindow?.postMessage({
      type: 'ygocc:deck-source',
      deck: deck ? { name: deck.name, text: formatDeckText(deck) } : null,
    }, labOrigin);
  }
}
