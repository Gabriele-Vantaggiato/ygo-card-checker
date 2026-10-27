import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnDestroy, OnInit, computed, effect, inject, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CardCondition, CollectionDraft, ScanCandidate, ScanDetection, ScanQueueEntry } from '../../../models/collection.model';
import { YgoCard } from '../../../models/ygo-card.model';
import { CollectionPriceService } from '../../../services/collection-price.service';
import { CollectionScannerService } from '../../../services/collection-scanner.service';
import { CardIndexService } from '../../../services/card-index.service';
import { CollectionService } from '../../../services/collection.service';
import { CardEmbeddingService } from '../../../services/embedding/card-embedding.service';
import { ToastService } from '../../../services/toast.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { mergeDraft } from '../../../utils/collection.utils';
import { guideRect } from '../../../utils/scan-geometry.utils';
import { scanStatusText } from '../../../utils/scan-status.utils';
import { CollectionReviewListComponent, EntryPatch } from './collection-review-list.component';

const DEFAULT_CONDITION: CardCondition = 'NM';
const NOTICE_MS = 4000;
const MAX_STRIP = 5;
const THUMB_URL = 'https://images.ygoprodeck.com/images/cards_small/';

/** Full-screen live scan: camera + guide frame, or the review queue with manual add. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-collection-scanner',
  standalone: true,
  imports: [FormsModule, CollectionReviewListComponent],
  template: `
    <div class="fixed inset-0 z-50 flex flex-col bg-base-100" role="dialog" aria-modal="true" aria-label="Scansiona carte">
      <header class="flex items-center justify-between gap-3 border-b border-base-300/60 px-4 py-2">
        <h2 class="section-title">Scansiona carte</h2>
        <button type="button" class="btn btn-ghost" (click)="close()">Chiudi</button>
      </header>

      @if (!reviewOpen()) {
        <section class="flex min-h-0 flex-1 flex-col items-center justify-center bg-neutral p-3">
          <div class="relative" [style.aspect-ratio]="aspect()" [style.width]="'min(100%, calc(62vh * ' + aspect() + '))'">
            <video #video class="absolute inset-0 h-full w-full rounded-lg bg-black object-cover" autoplay playsinline muted (loadedmetadata)="onMetadata()"></video>
            <div
              class="pointer-events-none absolute rounded-lg border-2 border-dashed transition-colors duration-150"
              [class.border-white/70]="!flash()"
              [class.border-success]="flash()"
              [style.left.%]="guide().x * 100"
              [style.top.%]="guide().y * 100"
              [style.width.%]="guide().w * 100"
              [style.height.%]="guide().h * 100"
            ></div>
          </div>
          @if (strip().length > 0) {
            <div class="mt-3 w-full max-w-md" role="group" aria-label="Carte probabili">
              <p class="mb-1 text-center text-xs text-neutral-content/70">Tocca la carta giusta per aggiungerla</p>
              <ul class="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                @for (candidate of strip(); track candidate.card.id; let first = $first) {
                  <li class="w-24 shrink-0 snap-start">
                    <button
                      type="button"
                      class="flex min-h-11 w-full flex-col items-center gap-1 rounded-lg border p-1 text-center transition-colors active:scale-95"
                      [class.border-primary]="first"
                      [class.border-white/20]="!first"
                      [class.ring-2]="first"
                      [class.ring-primary/40]="first"
                      [attr.aria-label]="'Aggiungi ' + candidate.card.name"
                      (click)="pickCandidate(candidate)"
                    >
                      <img [src]="thumbUrl(candidate.card.id)" alt="" loading="lazy" class="h-28 w-20 rounded bg-black object-cover" />
                      <span class="line-clamp-2 min-h-8 w-full text-[11px] leading-tight text-neutral-content">{{ candidate.card.name }}</span>
                    </button>
                  </li>
                }
              </ul>
            </div>
          }
          <p class="mt-3 min-h-5 text-center text-sm text-neutral-content/80" aria-live="polite">{{ statusText() }}</p>
          @if (scanner.state() === 'scanning' && scanner.phase() === 'ocr-fallback' && strip().length === 0) {
            <p class="mt-1 min-h-4 max-w-sm text-center text-xs text-neutral-content/60">
              @if (scanner.lastRead(); as read) {
                Sto leggendo: &ldquo;{{ read }}&rdquo;
              } @else {
                Nessun testo leggibile: avvicina la carta o riduci i riflessi.
              }
            </p>
          }
          <p class="mt-1 max-w-sm text-center text-xs text-neutral-content/60">
            Luce diffusa, niente riflessi: inclina un po' la carta. Il codice (es. LOB-EN005) deve stare sotto l'immagine, a destra.
          </p>
          <button type="button" class="btn btn-ghost btn-xs mt-1 text-neutral-content/60" [attr.aria-pressed]="scanner.debugEnabled()" (click)="scanner.debugEnabled.set(!scanner.debugEnabled())">
            Diagnostica
          </button>
          @if (scanner.debugEnabled()) {
            <div class="mt-1 w-full max-w-sm rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-tight text-neutral-content/80">
              @if (scanner.debug(); as d) {
                @if (d.crop) {
                  <img [src]="d.crop" alt="Ritaglio analizzato" class="mb-1 max-h-24 w-full rounded bg-black object-contain" />
                }
                <div>passata: {{ d.pass }}</div>
                <div>nitidezza: {{ d.sharpness }}</div>
                <div class="break-all">top5: {{ d.top5 || '—' }}</div>
                <div class="break-all">codice: {{ d.codeText || '—' }}</div>
                <div class="break-all">nome: {{ d.nameText || '—' }}</div>
              } @else {
                In attesa di una lettura…
              }
              <div>backend: {{ embedding.backend() ?? '—' }}</div>
              <div class="break-all">indice: {{ cardIndex.version() ?? '—' }}</div>
            </div>
          }
        </section>
      } @else {
        <section class="min-h-0 flex-1 overflow-y-auto px-4">
          @if (scanner.error(); as cameraError) {
            <div class="alert alert-warning mt-4" role="status">
              <span class="text-sm">
                {{ cameraError === 'denied' ? 'Accesso alla fotocamera negato.' : 'Fotocamera non disponibile.' }}
                Puoi aggiungere le carte a mano.
              </span>
            </div>
          }

          @if (queue().length === 0) {
            <div class="empty-state my-6">
              <p class="empty-state-title">Nessuna carta in coda</p>
              <p class="empty-state-hint">Inquadra una carta oppure cercala per nome.</p>
            </div>
          } @else {
            <app-collection-review-list [entries]="queue()" [prices]="prices.prices()" (patch)="patchEntry($event)" (remove)="removeEntry($event)" />
          }

          <details class="my-4 rounded-lg border border-base-300/60 p-3" [open]="manualOpen()" (toggle)="onManualToggle($event)">
            <summary class="flex min-h-11 cursor-pointer items-center text-sm font-medium">Aggiungi a mano</summary>
            <form class="mt-2 flex gap-2" (submit)="$event.preventDefault(); search()">
              <input
                class="input input-bordered min-h-11 flex-1"
                type="search"
                [(ngModel)]="searchTerm"
                name="searchTerm"
                placeholder="Nome della carta"
                aria-label="Nome della carta"
              />
              <button class="btn btn-outline" type="submit" [disabled]="searching()">Cerca</button>
            </form>
            @if (searching()) {
              <span class="loading loading-spinner loading-sm mt-3"></span>
            } @else if (searchError()) {
              <p class="mt-3 text-sm text-error" role="alert">Ricerca non riuscita. Riprova.</p>
            } @else if (searched() && results().length === 0) {
              <p class="mt-3 text-sm text-base-content/60">Nessuna carta trovata.</p>
            }
            <ul class="mt-2 divide-y divide-base-300/60">
              @for (card of results(); track card.id) {
                <li>
                  <button type="button" class="min-h-11 w-full py-2 text-left text-sm hover:text-primary" [disabled]="adding()" (click)="addManual(card)">
                    {{ card.name }}
                    @if (addingId() === card.id) {
                      <span class="loading loading-spinner loading-xs ml-2 align-middle"></span>
                    }
                  </button>
                </li>
              }
            </ul>
          </details>
        </section>
      }

      <footer class="flex items-center justify-between gap-3 border-t border-base-300/60 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" class="btn btn-ghost" (click)="toggleView()">
          @if (!reviewOpen()) {
            Rivedi ({{ queueCount() }})
          } @else if (scanner.error()) {
            Riprova fotocamera
          } @else {
            Torna alla fotocamera
          }
        </button>
        <button type="button" class="btn btn-primary" [disabled]="queue().length === 0 || saving()" (click)="confirm()">
          @if (saving()) {
            <span class="loading loading-spinner loading-xs"></span>
          }
          Conferma {{ queueCount() }} {{ queueCount() === 1 ? 'carta' : 'carte' }}
        </button>
      </footer>
    </div>
  `,
})
export class CollectionScannerComponent implements OnInit, OnDestroy {
  protected readonly scanner = inject(CollectionScannerService);
  protected readonly prices = inject(CollectionPriceService);
  protected readonly embedding = inject(CardEmbeddingService);
  protected readonly cardIndex = inject(CardIndexService);
  private readonly collection = inject(CollectionService);
  private readonly api = inject(YgoApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly closed = output<void>();
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly queue = signal<ScanQueueEntry[]>([]);
  protected readonly queueCount = computed(() => this.queue().reduce((sum, entry) => sum + entry.quantity, 0));
  protected readonly reviewOpen = signal(false);
  protected readonly saving = signal(false);
  private previousOverflow = '';
  protected readonly adding = signal(false);
  protected readonly addingId = signal<number | null>(null);
  protected readonly manualOpen = signal(false);
  protected readonly flash = signal(false);
  protected readonly aspect = signal(3 / 4);
  protected readonly guide = signal(guideRect(720, 1280));
  /** Short-lived message (recognised / not recognised); never outlives NOTICE_MS nor the candidate strip. */
  private readonly notice = signal<string | null>(null);
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set once a candidate was tapped: the strip stays hidden until the service clears its candidates. */
  private readonly stripDismissed = signal(false);
  protected readonly strip = computed<ScanCandidate[]>(() => (this.stripDismissed() ? [] : this.scanner.lastCandidates().slice(0, MAX_STRIP)));
  protected readonly statusText = computed(() => {
    if (this.scanner.state() === 'starting') {
      return 'Avvio della fotocamera…';
    }
    if (this.strip().length > 0) {
      return 'Non sono sicuro: scegli la carta giusta';
    }
    const phase = this.scanner.phase();
    const notice = this.notice();
    if (notice && (phase === 'ready' || phase === 'ocr-fallback')) {
      return notice;
    }
    return scanStatusText(phase, this.embedding.progress());
  });

  protected searchTerm = '';
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly searchError = signal(false);
  protected readonly results = signal<YgoCard[]>([]);

  constructor() {
    this.scanner.detections$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((detection) => this.onDetection(detection));

    // The <video> only exists in the camera view: start when it appears, stop when it goes away.
    let cameraOn = false;
    effect(() => {
      const element = this.video()?.nativeElement;
      untracked(() => {
        if (element) {
          cameraOn = true;
          const state = this.scanner.state();
          if (state !== 'starting' && state !== 'scanning') {
            void this.scanner.start(element);
          }
        } else if (cameraOn) {
          cameraOn = false;
          this.scanner.stop();
        }
      });
    });

    // Camera refused/unavailable: fall back to the review view so cards can still be added by hand.
    effect(() => {
      if (this.scanner.state() === 'error') {
        untracked(() => this.openReview());
      }
    });

    let lastMiss = this.scanner.lastMiss();
    effect(() => {
      const miss = this.scanner.lastMiss();
      if (miss !== lastMiss) {
        lastMiss = miss;
        untracked(() => this.setNotice('Carta non riconosciuta: avvicinati o aggiungila a mano'));
      }
    });

    // A new unconfident round (candidates cleared by the service) re-enables the strip.
    effect(() => {
      if (this.scanner.lastCandidates().length === 0) {
        untracked(() => this.stripDismissed.set(false));
      }
    });
  }

  ngOnInit(): void {
    // Render at <body> level: the profile page animates with a transform, which would otherwise
    // become the containing block of this `fixed` overlay and clip or hide it.
    document.body.appendChild(this.host.nativeElement);
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    clearTimeout(this.noticeTimer);
    document.body.style.overflow = this.previousOverflow;
    this.scanner.stop();
  }

  private openReview(): void {
    this.manualOpen.set(this.queue().length === 0 || !!this.scanner.error());
    this.reviewOpen.set(true);
  }

  protected toggleView(): void {
    if (!this.reviewOpen()) {
      this.openReview();
    } else {
      // Leaving review for the camera: <video> re-appears and the effect restarts the stream
      // (start() clears the previous error itself).
      this.reviewOpen.set(false);
    }
  }

  protected onManualToggle(event: Event): void {
    this.manualOpen.set((event.target as HTMLDetailsElement).open);
  }

  protected onMetadata(): void {
    const element = this.video()?.nativeElement;
    if (element?.videoWidth && element.videoHeight) {
      this.aspect.set(element.videoWidth / element.videoHeight);
      this.guide.set(guideRect(element.videoWidth, element.videoHeight));
    }
  }

  protected close(): void {
    this.closed.emit();
  }

  private onDetection(detection: ScanDetection): void {
    this.queue.update((queue) => mergeDraft(queue, this.toEntry(detection.card, detection)));
    void this.prices.ensure([detection.card.id]);
    this.setNotice(`Riconosciuta: ${detection.card.name}`);
    this.feedback();
  }

  private setNotice(text: string): void {
    this.notice.set(text);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(null), NOTICE_MS);
  }

  protected thumbUrl(id: number): string {
    return `${THUMB_URL}${id}.jpg`;
  }

  /** Adds a suggested card like a manual add: first printing, EN, to be reviewed. */
  protected pickCandidate({ card }: ScanCandidate): void {
    this.queue.update((queue) => mergeDraft(queue, this.toEntry(card, this.manualDetection(card))));
    void this.prices.ensure([card.id]);
    this.stripDismissed.set(true);
    this.setNotice(`Aggiunta: ${card.name}`);
    this.feedback();
  }

  private manualDetection(card: YgoCard): ScanDetection {
    const printings = card.card_sets ?? [];
    return { card, printings, setCode: printings[0]?.set_code ?? `N/D-${card.id}`, language: 'EN', source: 'name', needsReview: true, alternatives: [] };
  }

  private toEntry(card: YgoCard, detection: ScanDetection): ScanQueueEntry {
    const printing = detection.printings.find((p) => p.set_code === detection.setCode) ?? detection.printings[0];
    return {
      tempId: crypto.randomUUID(),
      passcode: card.id,
      cardName: card.name,
      setCode: printing?.set_code ?? detection.setCode,
      rarity: printing?.set_rarity ?? 'N/D',
      language: detection.language,
      condition: DEFAULT_CONDITION,
      firstEdition: false,
      quantity: 1,
      notes: null,
      printings: detection.printings,
      needsReview: detection.needsReview,
    };
  }

  protected patchEntry({ tempId, patch }: EntryPatch): void {
    this.queue.update((queue) => queue.map((entry) => (entry.tempId === tempId ? { ...entry, ...patch, needsReview: false } : entry)));
  }

  protected removeEntry(tempId: string): void {
    this.queue.update((queue) => queue.filter((entry) => entry.tempId !== tempId));
  }

  protected async search(): Promise<void> {
    const term = this.searchTerm.trim();
    if (!term) {
      return;
    }
    this.searching.set(true);
    this.searchError.set(false);
    try {
      this.results.set(await firstValueFrom(this.api.searchCards$(term, 'it', 12)));
      this.searched.set(true);
    } catch {
      this.results.set([]);
      this.searchError.set(true);
    } finally {
      this.searching.set(false);
    }
  }

  protected async addManual(summary: YgoCard): Promise<void> {
    if (this.adding()) {
      return;
    }
    this.adding.set(true);
    this.addingId.set(summary.id);
    let card = summary;
    try {
      card = (await firstValueFrom(this.api.getCardById$(summary.id, 'en'))) ?? summary;
    } catch {
      // fall back to the search result: printings may be missing, the entry stays "da verificare"
    }
    try {
      this.queue.update((queue) =>
        mergeDraft(queue, this.toEntry(card, this.manualDetection(card))),
      );
      void this.prices.ensure([card.id]);
      this.results.set([]);
      this.searched.set(false);
      this.searchTerm = '';
    } finally {
      this.adding.set(false);
      this.addingId.set(null);
    }
  }

  protected async confirm(): Promise<void> {
    this.saving.set(true);
    try {
      const count = this.queueCount();
      const drafts: CollectionDraft[] = this.queue().map((entry) => this.toDraft(entry));
      await this.collection.addMany(drafts);
      this.toast.success(`${count} ${count === 1 ? 'carta aggiunta' : 'carte aggiunte'} alla collezione`);
      this.queue.set([]);
      this.close();
    } catch {
      this.toast.error('Salvataggio non riuscito. Riprova.');
    } finally {
      this.saving.set(false);
    }
  }

  private toDraft(entry: ScanQueueEntry): CollectionDraft {
    return {
      passcode: entry.passcode,
      cardName: entry.cardName,
      setCode: entry.setCode,
      rarity: entry.rarity,
      language: entry.language,
      condition: entry.condition,
      firstEdition: entry.firstEdition,
      quantity: entry.quantity,
      notes: entry.notes,
    };
  }

  private feedback(): void {
    this.flash.set(true);
    setTimeout(() => this.flash.set(false), 250);
    navigator.vibrate?.(40);
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
      osc.onended = () => void ctx.close();
    } catch {
      // audio is optional
    }
  }
}
