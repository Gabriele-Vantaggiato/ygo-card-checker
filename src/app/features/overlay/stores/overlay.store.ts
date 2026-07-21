import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, concat, from, of, Subject } from 'rxjs';
import {
  catchError,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  filter,
  finalize,
  first,
  map,
  skip,
  switchMap,
  tap,
} from 'rxjs/operators';
import { LegalityResult, YgoCard } from '../../../models/ygo-card.model';
import { CardRelatedResult } from '../../../models/card-knowledge.model';
import { I18nService } from '../../../services/i18n.service';
import { CardKnowledgeService } from '../../../services/card-knowledge.service';
import { CardLegalityFacade } from '../../../services/card-legality.facade';
import { YgoApiService } from '../../../services/ygo-api.service';
import { FormatStore } from '../../../core/stores/format.store';
import { CardScreenOcrService, OcrResult } from '../../../services/card-screen-ocr.service';
import { ScreenCaptureService } from '../../../services/screen-capture.service';
import { PasscodeCatalogService } from '../../../services/passcode-catalog.service';
import { CardIdbCacheService } from '../../../services/card-idb-cache.service';
import { matchesKnownCard, MdproOcrParseResult } from '../../../utils/mdpro-ocr-parse';
import {
  DetailProbeSample,
  looksLikeDetailClosed,
  looksLikeDetailModal,
  MDPRO_MODAL_PROBE_CROP,
  toProbeSample,
} from '../../../utils/mdpro-detail-probe';
import { OverlayPipShell } from '../overlay-pip-shell';

const EMPTY_RELATED: CardRelatedResult = {
  tags: [],
  displayTags: [],
  series: [],
  mentions: [],
  effects: [],
  suggestions: [],
  groups: [],
  available: false,
};

/** Cheap probe interval — no OCR. */
const PROBE_MS = 450;
const OCR_MAX_WIDTH = 960;
/** Frames to average as "no detail" baseline after live starts. */
const BASELINE_FRAMES = 3;
const CLOSE_STREAK = 2;
const OPEN_STREAK = 2;

type OverlayPhase = 'idle' | 'capturing' | 'ocr' | 'resolving' | 'ready' | 'error';

/**
 * Restored working flow:
 * - Probe open/close with pixelmatch (no OCR in the loop)
 * - OCR once on detail open (full frame — crop alone was too brittle)
 * - PiP opened on Start live (Chrome gesture); parked as side rail on close
 */
@Injectable()
export class OverlayStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formatStore = inject(FormatStore);
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly knowledgeService = inject(CardKnowledgeService);
  private readonly i18n = inject(I18nService);
  private readonly capture = inject(ScreenCaptureService);
  private readonly ocr = inject(CardScreenOcrService);
  private readonly passcodes = inject(PasscodeCatalogService);
  private readonly idbCache = inject(CardIdbCacheService);

  private readonly resolveIntent$ = new Subject<{
    parsed: MdproOcrParseResult;
    identityKey: string;
  }>();

  private liveStream: MediaStream | null = null;
  private liveVideo: HTMLVideoElement | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private lastResolvedIdentity = '';
  private scanBusy = false;
  private detailOpen = false;
  private baseline: DetailProbeSample | null = null;
  private baselineCollected = 0;
  private openStreak = 0;
  private closeStreak = 0;
  private readonly pip = new OverlayPipShell();

  readonly formats = this.formatStore.formats;
  readonly selectedFormatId = this.formatStore.formatId;
  readonly selectedFormat = this.formatStore.selectedFormat;
  readonly selectedFormat$ = this.formatStore.selectedFormat$;

  readonly phase = signal<OverlayPhase>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly statusKey = signal<string | null>(null);
  readonly statusParams = signal<Record<string, string> | undefined>(undefined);
  readonly ocrPreview = signal<string>('');
  readonly liveActive = signal(false);
  readonly pipCollapsed = signal(false);
  readonly detailVisible = signal(false);
  readonly manualQuery = signal('');
  readonly selectedCard = signal<YgoCard | null>(null);
  readonly legalityResult = signal<LegalityResult | null>(null);
  readonly relatedLoading = signal(false);
  readonly relatedResult = signal<CardRelatedResult>(EMPTY_RELATED);
  readonly captureSupported = signal(this.capture.isDisplayCaptureSupported());
  readonly pipSupported = signal(
    typeof window !== 'undefined' && 'documentPictureInPicture' in window,
  );

  private readonly selectedCard$ = toObservable(this.selectedCard);

  readonly relatedAvailable = computed(() => this.relatedResult().available);
  readonly relatedSeries = computed(() => this.relatedResult().series);
  readonly relatedTags = computed(() => this.relatedResult().displayTags);
  readonly relatedMentions = computed(() => this.relatedResult().mentions);
  readonly relatedEffects = computed(() => this.relatedResult().effects);
  readonly relatedSuggestions = computed(() => this.relatedResult().suggestions);
  readonly relatedGroups = computed(() => this.relatedResult().groups);

  constructor() {
    this.bindResolve();
    this.bindLegality();
    this.bindRelated();
    this.bindLanguageRefresh();
  }

  /** Re-fetch name/effect when the site language changes. */
  private bindLanguageRefresh(): void {
    this.i18n.lang$
      .pipe(
        distinctUntilChanged(),
        skip(1),
        switchMap((lang) => {
          const card = this.selectedCard();
          if (!card) {
            return of(null);
          }
          return this.ygoApi.getCardById$(card.id, lang).pipe(
            tap((localized) => {
              if (localized) {
                this.idbCache.put(localized, lang);
              }
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((localized) => {
        if (!localized || this.selectedCard()?.id !== localized.id) {
          return;
        }
        this.selectCard(localized);
      });
  }

  setFormatId(formatId: string): void {
    this.formatStore.setFormatId(formatId);
  }

  setManualQuery(query: string): void {
    this.manualQuery.set(query);
  }

  lookupManual(): void {
    const name = this.manualQuery().trim();
    if (name.length < 2) {
      return;
    }
    const identityKey = `name:${name.toLowerCase()}`;
    if (identityKey === this.lastResolvedIdentity && this.selectedCard()) {
      this.statusKey.set('overlay.status.sameCard');
      this.statusParams.set({ name: this.selectedCard()!.name });
      return;
    }
    this.statusKey.set('overlay.status.lookingUp');
    this.statusParams.set({ name });
    this.resolveIntent$.next({
      parsed: { passcodes: [], candidateName: name, rawLines: [name] },
      identityKey,
    });
  }

  startLive(): void {
    if (this.liveActive()) {
      return;
    }
    this.errorKey.set(null);
    this.statusKey.set('overlay.status.liveStarting');
    this.statusParams.set(undefined);
    this.phase.set('capturing');
    this.baseline = null;
    this.baselineCollected = 0;
    this.openStreak = 0;
    this.closeStreak = 0;
    this.detailOpen = false;
    this.detailVisible.set(false);

    // PiP must open in the same user gesture as the click (Chrome).
    const pipPromise = this.openLivePip();
    // Warm passcode index in parallel with screen share.
    this.passcodes.ensureLoaded$().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.capture
      .startDisplayCapture$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        void pipPromise.then((opened) => {
          if (!result.ok) {
            this.phase.set('error');
            this.errorKey.set(result.errorKey);
            this.statusKey.set(null);
            this.closeLivePip();
            return;
          }
          this.liveStream = result.stream;
          this.liveVideo = result.video;
          this.liveActive.set(true);
          this.phase.set('ready');
          this.statusKey.set('overlay.status.waitingDetail');
          result.stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stopLive());
          if (opened) {
            this.parkPipDock();
          } else {
            this.errorKey.set('overlay.error.pipBlocked');
          }
          this.startProbing();
        });
      });
  }

  /** Repair PiP with an explicit click if Chrome blocked the first open. */
  openPipNow(): void {
    if (!this.liveActive()) {
      this.errorKey.set('overlay.error.liveRequired');
      return;
    }
    void this.openLivePip().then((opened) => {
      if (!opened) {
        this.errorKey.set('overlay.error.pipBlocked');
        return;
      }
      this.errorKey.set(null);
      if (this.detailOpen) {
        this.pipCollapsed.set(false);
        this.syncPip();
        this.runOcrOnce(true);
      } else {
        this.parkPipDock();
      }
    });
  }

  collapsePip(): void {
    if (!this.liveActive() || !this.pip.open) {
      return;
    }
    this.parkPipDock();
    this.statusKey.set('overlay.status.paused');
    this.statusParams.set(undefined);
    this.phase.set('ready');
  }

  expandPip(): void {
    if (!this.liveActive() || !this.pip.open) {
      return;
    }
    this.pipCollapsed.set(false);
    this.statusKey.set(
      this.detailOpen ? 'overlay.status.liveReady' : 'overlay.status.waitingDetail',
    );
    this.syncPip();
  }

  scanNow(): void {
    if (!this.liveActive()) {
      this.errorKey.set('overlay.error.liveRequired');
      return;
    }
    if (this.pipCollapsed()) {
      this.expandPip();
    }
    this.runOcrOnce(true);
  }

  pasteFromClipboard(): void {
    this.errorKey.set(null);
    this.phase.set('ocr');
    this.statusKey.set('overlay.status.reading');
    this.capture
      .clipboardImageToCanvas$()
      .pipe(
        switchMap((frame) => {
          if ('ok' in frame && frame.ok === false) {
            return of({ ok: false as const, errorKey: frame.errorKey });
          }
          const canvas = downscaleCanvas((frame as { canvas: HTMLCanvasElement }).canvas);
          return this.ocr.recognize$(canvas);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.applyOcrResult(result));
  }

  processFile(file: File): void {
    this.errorKey.set(null);
    this.phase.set('ocr');
    this.statusKey.set('overlay.status.reading');
    this.capture
      .fileToCanvas$(file)
      .pipe(
        switchMap((frame) => {
          if ('ok' in frame && frame.ok === false) {
            return of({ ok: false as const, errorKey: frame.errorKey });
          }
          const canvas = downscaleCanvas((frame as { canvas: HTMLCanvasElement }).canvas);
          return this.ocr.recognize$(canvas);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.applyOcrResult(result));
  }

  stopLive(): void {
    this.stopProbing();
    this.capture.stopStream(this.liveStream);
    this.liveStream = null;
    this.liveVideo = null;
    this.liveActive.set(false);
    this.pipCollapsed.set(false);
    this.detailOpen = false;
    this.detailVisible.set(false);
    this.scanBusy = false;
    this.baseline = null;
    this.baselineCollected = 0;
    this.lastResolvedIdentity = '';
    this.closeLivePip();
    void this.ocr.dispose();
    if (this.phase() === 'capturing' || this.phase() === 'ocr') {
      this.phase.set('idle');
    }
    this.statusKey.set(null);
  }

  selectCard(card: YgoCard): void {
    this.selectedCard.set(card);
    this.manualQuery.set(card.name);
    this.phase.set('ready');
    this.errorKey.set(null);
    this.statusKey.set('overlay.status.found');
    this.statusParams.set({ name: card.name });
    this.lastResolvedIdentity = `id:${card.id}`;
    this.syncPip();
  }

  openRelatedCard(cardId: number): void {
    if (this.selectedCard()?.id === cardId) {
      return;
    }
    this.phase.set('resolving');
    this.ygoApi
      .getCardById$(cardId, this.i18n.lang())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((card) => {
        if (card) {
          this.selectCard(card);
        } else {
          this.phase.set('error');
          this.errorKey.set('overlay.error.cardNotFound');
        }
      });
  }

  destroy(): void {
    this.stopLive();
  }

  private startProbing(): void {
    this.stopProbing();
    this.probeTimer = setInterval(() => this.probeTick(), PROBE_MS);
  }

  private stopProbing(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  /** Cheap tick: pixelmatch only. Never runs OCR. */
  private probeTick(): void {
    if (!this.liveActive() || this.scanBusy) {
      return;
    }
    const video = this.liveVideo;
    if (!video) {
      return;
    }
    const frame = this.capture.grabCroppedFrame(video, MDPRO_MODAL_PROBE_CROP);
    if (!frame) {
      return;
    }
    const sample = toProbeSample(frame.canvas);

    if (this.baselineCollected < BASELINE_FRAMES) {
      this.baseline = sample;
      this.baselineCollected += 1;
      if (this.baselineCollected === BASELINE_FRAMES) {
        this.statusKey.set('overlay.status.waitingDetail');
      }
      return;
    }

    if (!this.detailOpen) {
      if (looksLikeDetailModal(sample, this.baseline)) {
        this.openStreak += 1;
        this.closeStreak = 0;
        if (this.openStreak >= OPEN_STREAK) {
          this.onDetailOpened();
        }
      } else {
        this.openStreak = 0;
      }
      return;
    }

    if (looksLikeDetailClosed(sample, this.baseline)) {
      this.closeStreak += 1;
      this.openStreak = 0;
      if (this.closeStreak >= CLOSE_STREAK) {
        this.onDetailClosed(sample);
      }
    } else {
      this.closeStreak = 0;
    }
  }

  private onDetailOpened(): void {
    this.detailOpen = true;
    this.detailVisible.set(true);
    this.openStreak = 0;
    this.closeStreak = 0;
    this.lastResolvedIdentity = '';
    this.pipCollapsed.set(false);
    this.statusKey.set('overlay.status.reading');
    this.statusParams.set(undefined);
    if (!this.pip.open) {
      this.errorKey.set('overlay.error.pipBlocked');
      this.statusKey.set('overlay.error.pipBlocked');
      this.runOcrOnce(false);
      return;
    }
    this.syncPip();
    this.runOcrOnce(false);
  }

  private onDetailClosed(sample: DetailProbeSample): void {
    this.detailOpen = false;
    this.detailVisible.set(false);
    this.openStreak = 0;
    this.closeStreak = 0;
    this.lastResolvedIdentity = '';
    this.scanBusy = false;
    this.baseline = sample;
    this.baselineCollected = BASELINE_FRAMES;
    this.selectedCard.set(null);
    this.legalityResult.set(null);
    this.relatedResult.set(EMPTY_RELATED);
    this.parkPipDock();
    this.phase.set('ready');
    this.statusKey.set('overlay.status.waitingDetail');
    this.statusParams.set(undefined);
  }

  private parkPipDock(): void {
    this.pipCollapsed.set(true);
    this.syncPip();
  }

  private async openLivePip(): Promise<boolean> {
    if (this.pip.open) {
      return true;
    }
    return this.pip.openWindow({
      onScan: () => this.scanNow(),
      onCollapse: () => this.collapsePip(),
      onExpand: () => {
        this.expandPip();
        if (this.detailOpen) {
          this.runOcrOnce(true);
        }
      },
    });
  }

  private runOcrOnce(forced: boolean): void {
    if (this.scanBusy) {
      return;
    }
    const video = this.liveVideo;
    if (!video) {
      return;
    }
    // Full frame worked reliably; tight title-crop missed passcode/name too often.
    const raw =
      this.capture.grabFullFrame(video) ?? this.capture.grabScaledFrame(video, OCR_MAX_WIDTH);
    if (!raw) {
      if (forced) {
        this.statusKey.set('overlay.status.noFrame');
        this.syncPip();
      }
      return;
    }

    this.scanBusy = true;
    this.phase.set('ocr');
    this.errorKey.set(null);
    this.statusKey.set('overlay.status.reading');
    this.syncPip();

    const canvas = downscaleCanvas(raw.canvas, OCR_MAX_WIDTH);
    this.ocr
      .recognize$(canvas)
      .pipe(
        finalize(() => {
          this.scanBusy = false;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.applyOcrResult(result));
  }

  private applyOcrResult(result: OcrResult): void {
    if (!result.ok) {
      this.phase.set(this.liveActive() ? 'ready' : 'error');
      this.errorKey.set(result.errorKey);
      this.statusKey.set(result.errorKey);
      this.syncPip();
      return;
    }

    this.ocrPreview.set(result.text.slice(0, 240));
    if (result.parsed.candidateName) {
      this.manualQuery.set(result.parsed.candidateName);
    }

    const identityKey = result.identityKey;
    const current = this.selectedCard();
    const sameAsSelected = matchesKnownCard(
      result.parsed,
      current?.id ?? null,
      current?.name ?? null,
    );
    const sameAsLastResolve = identityKey !== '' && identityKey === this.lastResolvedIdentity;

    if (sameAsSelected || sameAsLastResolve) {
      this.phase.set('ready');
      this.statusKey.set('overlay.status.sameCard');
      this.statusParams.set({
        name:
          current?.name ??
          result.parsed.candidateName ??
          String(result.parsed.passcodes[0] ?? ''),
      });
      this.syncPip();
      return;
    }

    // Do NOT lock identity until selectCard — failed lookups must remain retryable.
    this.statusKey.set('overlay.status.lookingUp');
    this.statusParams.set({
      name: result.parsed.candidateName ?? String(result.parsed.passcodes[0] ?? ''),
    });
    this.resolveIntent$.next({ parsed: result.parsed, identityKey });
    this.syncPip();
  }

  private closeLivePip(): void {
    this.pip.close();
    this.pipCollapsed.set(false);
  }

  private syncPip(): void {
    if (!this.pip.open) {
      return;
    }
    const key = this.statusKey() ?? this.errorKey();
    const statusText = key
      ? this.i18n.translate(key, this.statusParams())
      : this.i18n.translate('overlay.status.waitingDetail');
    this.pip.render({
      card: this.selectedCard(),
      legality: this.legalityResult(),
      related: this.relatedResult(),
      formatName: this.selectedFormat()?.name[this.i18n.lang()] ?? '',
      statusText,
      scanning: this.scanBusy || this.phase() === 'ocr' || this.phase() === 'resolving',
      collapsed: this.pipCollapsed(),
      t: (k, params) => this.i18n.translate(k, params),
    });
  }

  private bindResolve(): void {
    this.resolveIntent$
      .pipe(
        debounceTime(80),
        // Skip only when we already show that exact card id — allow retries after failures.
        filter(({ identityKey }) => {
          const current = this.selectedCard();
          if (!current) {
            return true;
          }
          return identityKey !== `id:${current.id}`;
        }),
        tap(() => {
          this.phase.set('resolving');
          this.errorKey.set(null);
        }),
        switchMap(({ parsed }) => this.resolveCard$(parsed)),
        tap({
          next: (card) => {
            if (!card) {
              this.phase.set('error');
              this.errorKey.set('overlay.error.cardNotFound');
              this.statusKey.set('overlay.error.cardNotFound');
              this.syncPip();
              return;
            }
            this.selectCard(card);
          },
          error: () => {
            this.phase.set('error');
            this.errorKey.set('overlay.error.api');
            this.syncPip();
          },
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private resolveCard$(parsed: MdproOcrParseResult) {
    const lang = this.i18n.lang();
    if (parsed.passcodes.length > 0) {
      return this.resolveByPasscodeFast$(parsed.passcodes, lang, parsed.candidateName);
    }
    return this.resolveByName$(parsed.candidateName, lang);
  }

  /**
   * Passcode path: prefer IDs present in the local catalog (MDPRO often lists
   * multiple numbers; the first may not be the Konami id YGOPRODeck knows).
   * IndexedDB → catalog stub → API (try each id) → name fallback.
   */
  private resolveByPasscodeFast$(
    passcodes: number[],
    lang: 'it' | 'en',
    fallbackName: string | null,
  ) {
    return this.passcodes.ensureLoaded$().pipe(
      switchMap(() => {
        const ordered = this.orderPasscodes(passcodes);
        const primary = ordered[0];
        return this.idbCache.get$(primary, lang).pipe(
          switchMap((cached) => {
            const stub = this.passcodes.toStubCard(primary, lang);
            const api$ = this.fetchFirstPasscode$(ordered, lang).pipe(
              switchMap((card) => {
                if (card) {
                  this.idbCache.put(card, lang);
                  return of(card);
                }
                return this.resolveByName$(fallbackName, lang);
              }),
            );

            if (cached) {
              return concat(
                of(cached),
                api$.pipe(
                  filter(
                    (card): card is YgoCard =>
                      !!card && (card.name !== cached.name || card.desc !== cached.desc),
                  ),
                ),
              );
            }
            if (stub) {
              return concat(
                of(stub),
                api$.pipe(filter((card): card is YgoCard => !!card)),
              );
            }
            return api$;
          }),
        );
      }),
    );
  }

  /** Catalog hits first — they resolve without guessing which MDPRO id is valid. */
  private orderPasscodes(passcodes: number[]): number[] {
    const known: number[] = [];
    const unknown: number[] = [];
    const seen = new Set<number>();
    for (const id of passcodes) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      if (this.passcodes.get(id)) {
        known.push(id);
      } else {
        unknown.push(id);
      }
    }
    return known.length > 0 ? [...known, ...unknown] : [...passcodes];
  }

  private fetchFirstPasscode$(ids: number[], lang: 'it' | 'en') {
    return from(ids).pipe(
      concatMap((id) => this.ygoApi.getCardById$(id, lang)),
      first((card): card is YgoCard => !!card, null),
    );
  }

  private resolveByName$(name: string | null, lang: 'it' | 'en') {
    if (!name || name.trim().length < 2) {
      return of(null);
    }
    return this.ygoApi.resolveCardByName$(name, lang).pipe(
      switchMap((exact) => {
        if (exact) {
          this.idbCache.put(exact, lang);
          return of(exact);
        }
        return this.ygoApi.searchCards$(name, lang, 10).pipe(
          map((cards) => cards[0] ?? null),
          tap((card) => {
            if (card) {
              this.idbCache.put(card, lang);
            }
          }),
        );
      }),
      catchError(() => of(null)),
    );
  }

  private bindLegality(): void {
    combineLatest([this.selectedCard$, this.selectedFormat$])
      .pipe(
        distinctUntilChanged(
          ([cardA, formatA], [cardB, formatB]) =>
            cardA?.id === cardB?.id && formatA?.id === formatB?.id,
        ),
        tap(([card, format]) => {
          if (!card || !format) {
            this.legalityResult.set(null);
          }
        }),
        filter(([card, format]) => !!card && !!format),
        switchMap(([card, format]) => this.cardLegality.evaluate$(card!, format!)),
        tap({
          next: (result) => {
            this.legalityResult.set(result);
            this.syncPip();
          },
          error: () => this.legalityResult.set(null),
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private bindRelated(): void {
    combineLatest([this.selectedCard$, this.selectedFormat$])
      .pipe(
        distinctUntilChanged(
          ([cardA, formatA], [cardB, formatB]) =>
            cardA?.id === cardB?.id && formatA?.id === formatB?.id,
        ),
        tap(([card, format]) => {
          if (!card || !format) {
            this.relatedResult.set(EMPTY_RELATED);
            this.relatedLoading.set(false);
          }
        }),
        filter(([card, format]) => !!card && !!format),
        tap(() => this.relatedLoading.set(true)),
        switchMap(([card, format]) =>
          this.knowledgeService.findRelated$(card!, format!).pipe(catchError(() => of(EMPTY_RELATED))),
        ),
        tap((result) => {
          this.relatedResult.set(result);
          this.relatedLoading.set(false);
          this.syncPip();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}

function downscaleCanvas(source: HTMLCanvasElement, maxWidth = OCR_MAX_WIDTH): HTMLCanvasElement {
  if (source.width <= maxWidth) {
    return source;
  }
  const scale = maxWidth / source.width;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return source;
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
