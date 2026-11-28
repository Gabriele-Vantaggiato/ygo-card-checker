import { ChangeDetectionStrategy, Component, DestroyRef, inject, isDevMode, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { Decklist } from '../../../models/decklist.model';
import { AuthService } from '../../../services/auth.service';
import { DeckSyncService } from '../../../services/deck-sync.service';
import { formatDeckText } from '../../../services/deck-text.service';

const api = '/intent-api';
const draftKey = 'ygocc.intent-runtime.prompt-draft';

function readDraft(): string {
  try { return sessionStorage.getItem(draftKey) ?? ''; }
  catch { return ''; }
}

interface LabStatus {
  sample: string;
  sampleStarters: string;
  dashboardPrompt: string;
}
interface CardTile { id: number; name: string; quantity?: number; partner?: string; section?: string }
interface Block {
  type: string;
  title: string;
  slot?: string;
  note?: string;
  groups?: { title?: string; cards: CardTile[] }[];
  items?: { label: string; value: string | number }[];
  columns?: string[];
  rows?: (string | number)[][];
}
interface View { title: string; layout: { columns: number }; blocks: Block[] }
interface SpeechInput {
  lang: string;
  start(): void;
  abort(): void;
  onresult: ((event: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page-main page-stack">
      <header><h1>Intent Runtime</h1><p>Playground del Deck Studio</p></header>
      @if (available) {
        <details class="card bg-base-200 p-4">
          <summary>Decklist di partenza · {{ activeName() }}</summary>
          @if (accountState() === 'signed-out') {
            <p>Accedi a YGOCC per scegliere una decklist dell’account.</p>
          } @else if (accountState() === 'loading') {
            <p>Caricamento delle decklist dell’account…</p>
          } @else if (accountState() === 'error') {
            <p>Impossibile caricare le decklist dell’account.</p>
            <button type="button" class="btn btn-sm" (click)="loadDecks()">Riprova</button>
          } @else if (decks().length === 0) {
            <p>L’account non contiene decklist con carte.</p>
          } @else {
            <label for="intent-source">Scegli la decklist di partenza</label>
            <select id="intent-source" class="select" #choice [value]="selectedId()" (change)="select(choice.value)">
              <option value="">Decklist di esempio</option>
              @for (deck of decks(); track deck.id) {
                <option [value]="deck.id">{{ deck.name }} · {{ deck.cards.length }} carte distinte</option>
              }
            </select>
          }
        </details>
        <section class="card bg-base-200 p-4">
          <label for="intent-prompt">Come vuoi comporre la dashboard?</label>
          <textarea id="intent-prompt" class="textarea w-full" rows="2" maxlength="2000"
            #promptBox [value]="prompt()" (input)="setPrompt(promptBox.value)"></textarea>
          <div class="actions">
            <button type="button" class="btn btn-primary" [disabled]="busy() || !status()" (click)="compose()">Componi</button>
            <button type="button" class="btn" [disabled]="busy() || !status()" (click)="showDashboard()">Dashboard carte</button>
            <button type="button" class="btn" [disabled]="!speech || listening() || busy() || !status()" (click)="dictate()">Detta il prompt</button>
            <label for="intent-mode">Interpretazione</label>
            <select id="intent-mode" class="select" #modeBox [value]="mode()" (change)="setMode(modeBox.value)">
              <option value="deterministic">Deterministica</option>
              <option value="codex">Codex con ChatGPT</option>
            </select>
          </div>
          @if (mode() === 'codex') { <p>Codex riceve la frase del prompt. Decklist e calcoli restano sul computer.</p> }
          @if (voiceMessage()) { <p role="status">{{ voiceMessage() }}</p> }
          @if (busy()) { <p role="status">Composizione in corso…</p> }
          @if (error()) {
            <p role="alert">{{ error() }}</p>
            @if (!status()) { <button type="button" class="btn btn-sm" [disabled]="connecting()" (click)="loadStatus()">Riprova connessione</button> }
          }
          @if (connecting()) { <p role="status">Connessione a Intent Runtime…</p> }
        </section>
        @if (view(); as current) {
          <section class="dashboard" [class.two-columns]="current.layout.columns === 2" aria-label="Dashboard composta">
            @for (block of current.blocks; track $index) {
              <section class="card bg-base-200 p-4" [class.full-width]="block.slot === 'full'">
                <h2>{{ block.title }}</h2>
                @if (block.note) { <p>{{ block.note }}</p> }
                @if (block.slot === 'analysis') {
                  <label for="intent-hand">Mano iniziale</label>
                  <select id="intent-hand" class="select select-sm" #handBox [value]="hand()" (change)="hand.set(+handBox.value)">
                    <option value="5">5 carte</option><option value="6">6 carte</option>
                  </select>
                  <p>Seleziona le carte chiave nel Main Deck, poi ricalcola.</p>
                  @if (starters().length) { <p>Carte chiave: {{ starters().join(', ') }}</p> }
                  <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="recalculate()">Ricalcola</button>
                }
                @if (block.items; as items) {
                  <dl class="metrics">
                    @for (item of items; track item.label) { <div><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div> }
                  </dl>
                }
                @if (block.groups; as groups) {
                  @for (group of groups; track $index) {
                    @if (group.title) { <h3>{{ group.title }}</h3> }
                    <ul class="card-grid">
                      @for (card of group.cards; track card.id) {
                        <li>
                          <button class="card-tile" type="button" (click)="inspect(card)"
                            [class.is-key]="card.section === 'main' && starters().includes(card.name)">
                            <img [src]="imageUrl(card.id)" alt="" loading="lazy" (error)="hideImage($event)">
                            <strong>{{ card.name }}</strong>
                            @if (card.quantity) { <span>{{ card.quantity }}×</span> }
                            @if (card.partner) { <small>Con {{ card.partner }}</small> }
                          </button>
                        </li>
                      } @empty { <li>Nessuna corrispondenza nell’indice.</li> }
                    </ul>
                  }
                }
                @if (block.rows; as rows) {
                  <table class="table table-sm"><thead><tr>
                    @for (column of block.columns ?? []; track column) { <th scope="col">{{ column }}</th> }
                  </tr></thead><tbody>
                    @for (row of rows; track $index) {
                      <tr>@for (value of row; track $index) { <td>{{ value }}</td> }</tr>
                    }
                  </tbody></table>
                }
              </section>
            }
          </section>
        }
        @if (selectedCard(); as card) {
          <section class="card bg-base-200 p-4 inspector" aria-label="Carta selezionata">
            <img [src]="imageUrl(card.id)" alt="" (error)="hideImage($event)">
            <div><h2>{{ card.name }}</h2>
              @if (card.partner) { <p>Trovata insieme a {{ card.partner }} nelle liste indicizzate.</p> }
              @if (card.section === 'main') {
                <button type="button" class="btn btn-primary btn-sm" (click)="toggleStarter(card.name)">
                  {{ starters().includes(card.name) ? 'Togli dalle carte chiave' : 'Usa come carta chiave' }}
                </button>
              }
              <button type="button" class="btn btn-sm" (click)="selectedCard.set(null)">Chiudi</button>
            </div>
          </section>
        }
      } @else {
        <p>Intent Runtime è disponibile nella versione locale di YGOCC.</p>
      }
    </main>
  `,
  styles: `
    summary { cursor: pointer; }
    label { display: block; margin-block: .35rem; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-top: .75rem; }
    .dashboard { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
    .dashboard.two-columns { grid-template-columns: minmax(0, 2fr) minmax(15rem, 1fr); }
    .full-width { grid-column: 1 / -1; }
    .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); gap: .6rem; margin-block: .5rem 1rem; }
    .card-tile { display: grid; align-content: start; text-align: start; gap: .2rem; width: 100%; height: 100%; font-size: .75rem; padding: .35rem; border: 1px solid transparent; border-radius: .4rem; background: var(--color-base-300); }
    .card-tile:hover, .card-tile:focus-visible, .card-tile.is-key { border-color: var(--color-primary); }
    .card-tile img { width: 100%; aspect-ratio: 0.69; object-fit: contain; }
    .metrics { display: grid; gap: .5rem; margin-block: .75rem; }
    .metrics dd { font-size: 1.6rem; font-weight: 650; }
    .inspector { display: flex; flex-direction: row; gap: 1rem; align-items: center; position: sticky; bottom: .5rem; z-index: 2; box-shadow: 0 0 1rem #0006; }
    .inspector img { width: 4rem; }
    @media (max-width: 780px) { .dashboard.two-columns { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class IntentDecklistPage {
  private readonly auth = inject(AuthService);
  private readonly deckSync = inject(DeckSyncService);
  private readonly destroy = inject(DestroyRef);
  private loadSequence = 0;

  private sequence = 0;
  readonly available = isDevMode() && ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  readonly accountState = signal<'signed-out' | 'loading' | 'ready' | 'error'>('signed-out');
  readonly decks = signal<Decklist[]>([]);
  readonly selectedId = signal('');
  readonly status = signal<LabStatus | null>(null);
  readonly view = signal<View | null>(null);
  readonly prompt = signal(readDraft());
  readonly connecting = signal(false);
  private readonly lifecycle = new AbortController();
  readonly mode = signal<'deterministic' | 'codex'>('deterministic');
  readonly starters = signal<string[]>([]);
  readonly hand = signal(5);
  readonly selectedCard = signal<CardTile | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly listening = signal(false);
  readonly voiceMessage = signal('');
  readonly speech = this.createSpeech();

  constructor() {
    if (!this.available) return;
    this.destroy.onDestroy(() => {
      this.sequence++;
      this.loadSequence++;
      this.lifecycle.abort();
      this.speech?.abort();
    });
    void this.loadStatus();
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
    this.sequence++;
    this.busy.set(false);
    this.selectedId.set(this.decks().some(deck => deck.id === id) ? id : '');
    this.selectedCard.set(null);
    this.starters.set(this.selectedId() ? [] : this.sampleStarters());
    this.view.set(null);
    this.error.set('');
    void this.recalculate();
  }

  activeName(): string {
    return this.decks().find(deck => deck.id === this.selectedId())?.name ?? 'Esempio';
  }

  async loadStatus(): Promise<void> {
    if (this.connecting()) return;
    this.connecting.set(true);
    this.error.set('');
    try {
      for (const delay of [0, 300, 900]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (this.lifecycle.signal.aborted) return;
        try {
          const response = await fetch(api + '/api/status', {
            cache: 'no-store',
            signal: AbortSignal.any([this.lifecycle.signal, AbortSignal.timeout(2500)]),
          });
          if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) continue;
          const status: LabStatus = await response.json();
          if (!status.dashboardPrompt || !status.sampleStarters || !status.sample) continue;
          this.status.set(status);
          if (!this.prompt().trim()) this.prompt.set(status.dashboardPrompt);
          if (!this.selectedId()) this.starters.set(this.sampleStarters());
          await this.recalculate();
          return;
        } catch { /* the local service may be restarting */ }
      }
      if (!this.lifecycle.signal.aborted) this.error.set('YGOCC è aperto, ma Intent Runtime non risponde. Puoi riprovare senza perdere il prompt.');
    } finally {
      this.connecting.set(false);
    }
  }

  setPrompt(value: string): void {
    this.prompt.set(value);
    try { sessionStorage.setItem(draftKey, value); }
    catch { /* the prompt remains editable if storage is unavailable */ }
  }

  private sampleStarters(): string[] {
    return this.status()?.sampleStarters.split(',').map(name => name.trim()) ?? [];
  }

  setMode(value: string): void { this.mode.set(value === 'codex' ? 'codex' : 'deterministic'); }
  imageUrl(id: number): string { return `${api}/card-images/${id}.jpg`; }
  hideImage(event: Event): void { (event.target as HTMLImageElement).hidden = true; }
  inspect(card: CardTile): void { this.selectedCard.set(card); }
  toggleStarter(name: string): void {
    this.starters.update(names => names.includes(name) ? names.filter(value => value !== name) : [...names, name]);
  }

  showDashboard(): void {
    this.setPrompt(this.status()?.dashboardPrompt ?? '');
    void this.recalculate();
  }
  recalculate(): Promise<void> {
    return this.compose(this.status()?.dashboardPrompt ?? '', 'deterministic');
  }

  async compose(intent = this.prompt(), mode = this.mode()): Promise<void> {
    const status = this.status();
    if (!status || !intent.trim() || this.busy()) return;
    const sequence = ++this.sequence;
    const deck = this.decks().find(entry => entry.id === this.selectedId());
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await fetch(api + '/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, mode, deck: deck ? formatDeckText(deck) : status.sample,
          starters: this.starters().join(', '), hand: this.hand() }),
      });
      const view = await response.json();
      if (!response.ok) throw Error(view.error ?? 'Composizione non riuscita.');
      if (sequence === this.sequence) this.view.set(view as View);
    } catch (error) {
      if (sequence === this.sequence) this.error.set(error instanceof Error ? error.message : 'Composizione non riuscita.');
    } finally {
      if (sequence === this.sequence) this.busy.set(false);
    }
  }

  private createSpeech(): SpeechInput | null {
    const browser = window as Window & { SpeechRecognition?: new () => SpeechInput; webkitSpeechRecognition?: new () => SpeechInput };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) return null;
    const speech = new Recognition();
    speech.lang = 'it-IT';
    speech.onresult = event => {
      const transcript = event.results[0][0].transcript;
      this.setPrompt(transcript);
      this.voiceMessage.set('Prompt trascritto.');
      void this.compose(transcript);
    };
    speech.onerror = () => this.voiceMessage.set('Dettatura non riuscita. Puoi scrivere il prompt.');
    speech.onend = () => this.listening.set(false);
    return speech;
  }

  dictate(): void {
    if (!this.speech) return;
    try {
      this.speech.start();
      this.listening.set(true);
      this.voiceMessage.set('In ascolto. La dettatura può usare il servizio vocale del browser.');
    } catch {
      this.voiceMessage.set('Microfono non disponibile.');
    }
  }
}
