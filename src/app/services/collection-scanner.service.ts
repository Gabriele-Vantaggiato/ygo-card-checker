import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, catchError, defaultIfEmpty, firstValueFrom, of, timeout } from 'rxjs';
import { CardLanguage, ScanCandidate, ScanDetection } from '../models/collection.model';
import { CardSet, YgoCard } from '../models/ygo-card.model';
import { FrameHit, FrameVoter, VoteResult } from '../utils/frame-vote.utils';
import { canonicalizeName, cleanOcrName, normalizeName } from '../utils/name-match.utils';
import { ScanConsensus } from '../utils/scan-consensus.utils';
import { binarize, meanLuminance, otsuThreshold, stretchContrast, toGrayscale } from '../utils/image-preprocess.utils';
import { ART_BOX, cropRect, guideRect } from '../utils/scan-geometry.utils';
import { PresenceCooldown, UnconfidentClock, formatTopHits, shouldOfferCandidates } from '../utils/scan-recognition.utils';
import { ParsedSetCode, parseSetCode } from '../utils/set-code.utils';
import { isSharp, laplacianVariance } from '../utils/sharpness.utils';
import { CardIndexService } from './card-index.service';
import { CardScreenOcrService } from './card-screen-ocr.service';
import { CardsetLookupService, ScanMatch } from './cardset-lookup.service';
import { CardEmbeddingService } from './embedding/card-embedding.service';
import { YgoApiService } from './ygo-api.service';

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = Math.round((FRAME_WIDTH * 86) / 59);
const TICK_MS = 300;
const OCR_UPSCALE = 2;
const RECENT_NAMES = 6;
const LAST_READ_MAX = 40;
const RESOLVE_TIMEOUT_MS = 8000;
const MAX_SEEDS = 20;
/** Below this mean luminance the band is dark (foil/dark frame): also try an inverted pass. */
const DARK_BAND_LUMINANCE = 110;
const DEBUG_TEXT_MAX = 80;

/** Width of the downscaled copy used for the sharpness gate (SHARPNESS_THRESHOLD is tuned at 224 px). */
const SHARPNESS_WIDTH = 224;
const SEARCH_K = 5;
const MAX_CANDIDATES = 5;
/** id -> card cache for the candidates (cards are session data, kept across runs). */
const CARD_CACHE_MAX = 200;
/** A background lookup that returned nothing is not retried for this long (not cached as "not found"). */
const CARD_RETRY_MS = 5000;
/** Max wait for the top card + alternatives before an image detection is emitted. */
const DETECTION_RESOLVE_TIMEOUT_MS = 3000;
/** Budget of the optional set-code OCR pass that picks the printing of an image detection. */
const SET_CODE_OCR_BUDGET_MS = 500;
/** The emitted card is not emitted again until it was observed absent for this long. */
const PRESENCE_COOLDOWN_MS = 1500;
/** A frame embedding slower than this is treated as a hung worker: OCR fallback for the run. */
const EMBED_TIMEOUT_MS = 4000;
/** Side of the blank canvas used to warm the Tesseract worker. */
const OCR_WARMUP_SIZE = 16;

export type ScanPass = 'a' | 'b' | 'c' | 'name' | 'none';
export interface ScanDebug {
  crop: string | null;
  codeText: string;
  nameText: string;
  pass: string;
  /** Image recognition: `id:score` of the frame's top-5 hits ('' on the OCR path). */
  top5: string;
  /** Laplacian variance of the frame (0 on the OCR path). */
  sharpness: number;
}

/**
 * - `loading-model` / `loading-index`: recognizer assets still loading (OCR runs meanwhile);
 * - `ocr-fallback`: the model or the index failed (or the worker died): OCR only for this run;
 * - `blurry`: the last frame was too blurry to embed;
 * - `recognising`: sharp frames, no confident vote yet;
 * - `ready`: recognizer active and idle (no frame yet, or the card in view was just recognised).
 */
export type ScanPhase = 'loading-model' | 'loading-index' | 'blurry' | 'recognising' | 'ready' | 'ocr-fallback';

/**
 * Regions of the guide frame, as fractions of the card.
 * A PC webcam cannot resolve the printed set code, so there the name band is the realistic path.
 * The set code sits under the artwork on the right, but its exact position varies between
 * card eras, so the band spans x 0.30..1.0 and y 0.58..0.80.
 */
const SET_CODE_BAND = { x: 0.3, y: 0.58, w: 0.7, h: 0.22 };
const NAME_BAND = { x: 0.03, y: 0.02, w: 0.94, h: 0.1 };

type Seed = { kind: 'code'; candidates: string[]; language: CardLanguage } | { kind: 'name'; text: string };

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'error';

class EmbedTimeoutError extends Error {
  constructor(ms: number) {
    super(`frame embedding timed out after ${ms} ms`);
    this.name = 'EmbedTimeoutError';
  }
}

/** Rejects with EmbedTimeoutError once `ms` elapsed; a late settlement of `promise` is ignored. */
function rejectAfter<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EmbedTimeoutError(ms)), ms);
  });
  promise.catch(() => undefined); // a late rejection must not surface as unhandled
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/** Resolves to the promise's value, or null once `ms` elapsed (the promise keeps running). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/**
 * Camera loop for the collection scan. Crops the on-screen guide frame and recognises the card
 * from its image (DINOv2 embedding + card index, sharpness gate, multi-frame vote); the set-code
 * OCR pass only proposes the printing. Until the model and the index are ready (or when they
 * fail), the original OCR pipeline runs: set code (fallback: card name), debounced with
 * ScanConsensus and resolved into cards. Emits one detection per accepted card.
 */
@Injectable({ providedIn: 'root' })
export class CollectionScannerService {
  private readonly ocr = inject(CardScreenOcrService);
  private readonly lookup = inject(CardsetLookupService);
  private readonly cardIndex = inject(CardIndexService);
  private readonly embedding = inject(CardEmbeddingService);
  private readonly api = inject(YgoApiService);

  readonly state = signal<ScannerState>('idle');
  readonly error = signal<'denied' | 'unavailable' | null>(null);
  readonly lastMiss = signal(0);
  /** Diagnostics for tuning on real cards; no extra work is done while disabled. */
  readonly debugEnabled = signal(false);
  readonly debug = signal<ScanDebug | null>(null);
  /** Cleaned text read on the last tick (code, else name; image path: the top card's name); '' when unknown. */
  readonly lastRead = signal('');
  readonly phase = signal<ScanPhase>('loading-model');
  /** Laplacian variance of the last frame on the image path. */
  readonly sharpness = signal(0);
  /** Ranked candidates offered to the user after a while without a confident vote; [] otherwise. */
  readonly lastCandidates = signal<ScanCandidate[]>([]);

  private readonly detectionSubject = new Subject<ScanDetection>();
  readonly detections$: Observable<ScanDetection> = this.detectionSubject.asObservable();

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private running = false;
  /** Bumped by every start()/stop(); async work bails out when its captured id is stale. */
  private runId = 0;
  private consensus = this.newConsensus();
  private readonly seeds = new Map<string, Seed>();
  /** Last normalized names seen, so OCR-noisy variants of one name share a consensus key. */
  private recentNames: string[] = [];
  private readonly frame = document.createElement('canvas');
  private readonly band = document.createElement('canvas');
  private readonly sharpCanvas = document.createElement('canvas');

  // Image recognition, per run
  private voter = new FrameVoter();
  private presence = new PresenceCooldown(PRESENCE_COOLDOWN_MS);
  private clock = new UnconfidentClock();
  private lastVote: VoteResult | null = null;
  private offering = false;
  /** The embedding worker failed during this run: OCR only until the next start(). */
  private embedFailed = false;
  /** Shared across runs: a stale run's embed may still be running when a new run starts. */
  private embedInFlight = false;
  /** Bumped per embed; a result whose token is no longer current (timed out, newer embed) is dropped. */
  private embedSeq = 0;
  /** The Tesseract worker was warmed during this run (first tick with the recognizer ready). */
  private ocrWarmed = false;

  private readonly cardCache = new Map<number, YgoCard>();
  private readonly cardRequests = new Map<number, Promise<void>>();
  private readonly cardMissAt = new Map<number, number>();

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    const id = ++this.runId;
    this.video = video;
    this.state.set('starting');
    this.error.set(null);
    this.startRecognizer();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch (err) {
      if (id !== this.runId) {
        return;
      }
      this.error.set(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      this.state.set('error');
      return;
    }
    if (id !== this.runId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    await this.improveCamera(stream);
    if (id !== this.runId) {
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    if (id !== this.runId) {
      return;
    }
    this.consensus = this.newConsensus();
    this.seeds.clear();
    this.recentNames = [];
    this.lastRead.set('');
    this.resetRecognition();
    this.ocrWarmed = false;
    this.phase.set(this.recognizerReady() ? 'ready' : this.loadingPhase());
    this.running = true;
    this.state.set('scanning');
    void this.loop(video, id);
  }

  stop(): void {
    this.runId++;
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }
    this.seeds.clear();
    this.recentNames = [];
    this.lastRead.set('');
    this.resetRecognition();
    this.phase.set(this.recognizerReady() ? 'ready' : this.loadingPhase());
    this.state.set('idle');
  }

  /** Kicks off (or retries after a failure) the model and index downloads; never awaited. */
  private startRecognizer(): void {
    this.embedFailed = false;
    void this.cardIndex.load();
    void this.embedding.load().catch(() => undefined);
    this.phase.set(this.recognizerReady() ? 'ready' : this.loadingPhase());
  }

  private resetRecognition(): void {
    this.voter = new FrameVoter();
    this.presence = new PresenceCooldown(PRESENCE_COOLDOWN_MS);
    this.clock = new UnconfidentClock();
    this.lastVote = null;
    this.offering = false;
    this.sharpness.set(0);
    this.lastCandidates.set([]);
  }

  private recognizerReady(): boolean {
    return !this.embedFailed && this.cardIndex.state() === 'ready' && this.embedding.state() === 'ready';
  }

  private loadingPhase(): ScanPhase {
    const model = this.embedding.state();
    const index = this.cardIndex.state();
    if (this.embedFailed || model === 'error' || index === 'error') {
      return 'ocr-fallback';
    }
    return model !== 'ready' ? 'loading-model' : 'loading-index';
  }

  /** Best-effort continuous focus/exposure/white balance; unsupported on most desktops. */
  private async improveCamera(stream: MediaStream): Promise<void> {
    try {
      const track = stream.getVideoTracks()[0];
      // focusMode & co. are not in the DOM typings yet
      const advanced = [{ focusMode: 'continuous' }, { exposureMode: 'continuous' }, { whiteBalanceMode: 'continuous' }];
      await track?.applyConstraints({ advanced } as unknown as MediaTrackConstraints);
    } catch {
      // not supported: ignore
    }
  }

  private newConsensus(): ScanConsensus {
    return new ScanConsensus({ required: 2, windowSize: 4, cooldownMs: 1500 });
  }

  private async loop(video: HTMLVideoElement, id: number): Promise<void> {
    while (this.running && id === this.runId) {
      const startedAt = performance.now();
      try {
        await this.tick(video, id);
      } catch (err) {
        console.error('[collection-scanner]', err);
      }
      if (id !== this.runId) {
        return;
      }
      const wait = Math.max(0, TICK_MS - (performance.now() - startedAt));
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  private async tick(video: HTMLVideoElement, id: number): Promise<void> {
    const frame = this.grabFrame(video);
    if (!frame) {
      return;
    }
    if (this.recognizerReady()) {
      this.warmOcr();
      await this.imageTick(frame, id);
      return;
    }
    this.phase.set(this.loadingPhase());
    await this.ocrTick(frame, id);
  }

  /**
   * One tiny fire-and-forget OCR run when the recognizer first becomes ready in a run, so the
   * set-code pass of the first detection does not pay the Tesseract worker start-up.
   */
  private warmOcr(): void {
    if (this.ocrWarmed) {
      return;
    }
    this.ocrWarmed = true;
    const canvas = document.createElement('canvas');
    canvas.width = OCR_WARMUP_SIZE;
    canvas.height = OCR_WARMUP_SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, OCR_WARMUP_SIZE, OCR_WARMUP_SIZE);
    }
    void this.ocr.recognizeText(canvas).catch(() => undefined);
  }

  // ---------------------------------------------------------------- image recognition

  private async imageTick(frame: HTMLCanvasElement, id: number): Promise<void> {
    if (this.embedInFlight) {
      // a stale run's embed is still in the worker: skip this frame rather than queueing it
      return;
    }
    const ctx = frame.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return;
    }
    const now = performance.now();
    const debugOn = this.debugEnabled();
    const variance = this.measureSharpness(frame);
    this.sharpness.set(Math.round(variance));

    if (!isSharp(variance)) {
      this.phase.set('blurry');
      this.presence.push(null, now);
      this.clock.push('blurry', now);
      if (debugOn) {
        this.setImageDebug('blurry', '', variance);
      }
      return;
    }

    const full = ctx.getImageData(0, 0, frame.width, frame.height);
    const box = cropRect(frame.width, frame.height, ART_BOX);
    const art = ctx.getImageData(box.sx, box.sy, box.sw, box.sh);
    let embedded: { full: Float32Array; art: Float32Array };
    const seq = ++this.embedSeq;
    this.embedInFlight = true;
    try {
      // full.data / art.data are transferred to the worker (detached here); both ImageData are
      // fresh per tick and not read again below.
      embedded = await rejectAfter(
        this.embedding.embed(
          { rgba: full.data, width: full.width, height: full.height },
          { rgba: art.data, width: art.width, height: art.height },
        ),
        EMBED_TIMEOUT_MS,
      );
    } catch (err) {
      if (err instanceof EmbedTimeoutError) {
        // hung worker: drop it so the next start() loads a fresh one
        this.embedding.dispose();
      }
      if (id === this.runId) {
        this.onRecognizerFailure(err);
      }
      return;
    } finally {
      this.embedInFlight = false;
    }
    if (id !== this.runId || seq !== this.embedSeq) {
      return;
    }

    let hits: FrameHit[];
    try {
      hits = this.cardIndex.search(embedded.full, embedded.art, SEARCH_K);
    } catch (err) {
      this.onRecognizerFailure(err);
      return;
    }

    const vote = this.voter.push(hits);
    this.lastVote = vote;
    this.presence.push(hits[0]?.id ?? null, now);
    const ranked = vote.candidates.slice(0, MAX_CANDIDATES);
    void this.requestTopFirst(ranked.map((c) => c.id)).then(() => {
      if (id === this.runId) {
        this.refreshCandidates();
      }
    });
    const topCard = ranked[0] ? this.cardCache.get(ranked[0].id) : undefined;
    this.lastRead.set(topCard ? topCard.name.slice(0, LAST_READ_MAX) : '');
    if (debugOn) {
      this.setImageDebug('image', formatTopHits(hits), variance);
    }

    const top = ranked[0];
    if (vote.confident && top) {
      this.clock.push('confident', now);
      this.offering = false;
      this.lastCandidates.set([]);
      if (this.presence.isBlocked(top.id)) {
        // the card just emitted is still in front of the camera
        this.phase.set('ready');
        return;
      }
      this.phase.set('recognising');
      await this.emitImageDetection(frame, vote, id);
      return;
    }

    this.phase.set('recognising');
    if (shouldOfferCandidates(this.clock.push('sharp-unconfident', now))) {
      this.offering = true;
      this.refreshCandidates();
    }
  }

  private async emitImageDetection(frame: HTMLCanvasElement, vote: VoteResult, id: number): Promise<void> {
    const [top, ...others] = vote.candidates.slice(0, MAX_CANDIDATES);
    // Starts synchronously on the current frame, runs while the cards are resolved.
    const setCode = this.readSetCode(frame, id);
    await this.ensureCards(top.id, others.map((c) => c.id), DETECTION_RESOLVE_TIMEOUT_MS);
    if (id !== this.runId) {
      return;
    }
    const card = this.cardCache.get(top.id);
    if (!card) {
      // lookup failed (offline?): vote again rather than blocking this card
      this.voter.reset();
      this.lastMiss.set(Date.now());
      return;
    }
    const parsed = await setCode;
    if (id !== this.runId) {
      return;
    }

    const allPrintings = card.card_sets ?? [];
    const matched = parsed ? this.matchPrintings(allPrintings, parsed) : [];
    const printings = matched.length > 0 ? matched : allPrintings;
    const alternatives: ScanCandidate[] = others.flatMap((c) => {
      const alt = this.cardCache.get(c.id);
      return alt ? [{ card: alt, score: c.score / vote.framesUsed }] : [];
    });

    this.presence.block(top.id);
    this.voter.reset();
    this.clock.reset();
    this.offering = false;
    this.lastCandidates.set([]);
    this.phase.set('ready');
    this.detectionSubject.next({
      card,
      printings,
      setCode: printings[0]?.set_code ?? `N/D-${card.id}`,
      language: matched.length > 0 && parsed ? parsed.language : 'EN',
      source: 'image',
      needsReview: matched.length !== 1,
      alternatives,
    });
  }

  /** Printings of the card whose code matches the OCR read, in the parser's preference order. */
  private matchPrintings(printings: readonly CardSet[], parsed: ParsedSetCode): CardSet[] {
    for (const code of parsed.candidates) {
      const hits = printings.filter((p) => p.set_code.toUpperCase() === code.toUpperCase());
      if (hits.length > 0) {
        return hits;
      }
    }
    return [];
  }

  /** Optional set-code OCR pass on the frame, bounded by SET_CODE_OCR_BUDGET_MS; null on any failure. */
  private async readSetCode(frame: HTMLCanvasElement, id: number): Promise<ParsedSetCode | null> {
    try {
      const passes = this.setCodePasses(frame);
      const deadline = performance.now() + SET_CODE_OCR_BUDGET_MS;
      for (const pass of passes) {
        const left = deadline - performance.now();
        if (left <= 0) {
          return null;
        }
        const text = await withTimeout(this.ocr.recognizeText(pass.canvas()), left);
        if (text === null || id !== this.runId) {
          return null;
        }
        const parsed = parseSetCode(text);
        if (parsed) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('[collection-scanner] set-code pass', err);
    }
    return null;
  }

  private onRecognizerFailure(err: unknown): void {
    if (!this.embedFailed) {
      console.error('[collection-scanner] image recognition failed, falling back to OCR', err);
    }
    this.embedFailed = true;
    this.offering = false;
    this.lastCandidates.set([]);
    this.phase.set('ocr-fallback');
  }

  private refreshCandidates(): void {
    const vote = this.lastVote;
    if (!this.offering || !vote) {
      return;
    }
    this.lastCandidates.set(
      vote.candidates.slice(0, MAX_CANDIDATES).flatMap((c) => {
        const card = this.cardCache.get(c.id);
        return card ? [{ card, score: c.score / vote.framesUsed }] : [];
      }),
    );
  }

  private measureSharpness(frame: HTMLCanvasElement): number {
    const w = SHARPNESS_WIDTH;
    const h = Math.max(1, Math.round((frame.height * w) / frame.width));
    if (this.sharpCanvas.width !== w || this.sharpCanvas.height !== h) {
      // resizing a canvas reallocates and clears it: only when the size actually changes
      this.sharpCanvas.width = w;
      this.sharpCanvas.height = h;
    }
    const ctx = this.sharpCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return 0;
    }
    ctx.drawImage(frame, 0, 0, w, h);
    return laplacianVariance(ctx.getImageData(0, 0, w, h).data, w, h);
  }

  private setImageDebug(pass: string, top5: string, variance: number): void {
    this.debug.set({
      crop: this.sharpCanvas.toDataURL('image/jpeg', 0.7),
      codeText: '',
      nameText: '',
      pass,
      top5,
      sharpness: Math.round(variance),
    });
  }

  /**
   * Waits (bounded) for the top card and the alternatives to be resolved; forces a lookup even inside
   * the retry window. The top id is requested in its own batch, so an alternative id the API rejects
   * (a bad id fails the whole batch) cannot keep the top card from resolving.
   */
  private async ensureCards(topId: number, others: readonly number[], timeoutMs: number): Promise<void> {
    void this.requestCards([topId], true);
    void this.requestCards(others, true);
    const waits = [...new Set([topId, ...others])]
      .map((i) => this.cardRequests.get(i))
      .filter((p): p is Promise<void> => !!p);
    if (waits.length > 0) {
      await withTimeout(Promise.all(waits), timeoutMs);
    }
  }

  /** Background resolution of ranked ids: the first id in its own batch, the rest in a second one. */
  private requestTopFirst(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) {
      return Promise.resolve();
    }
    return Promise.all([this.requestCards(ids.slice(0, 1)), this.requestCards(ids.slice(1))]).then(() => undefined);
  }

  /**
   * Fire-and-forget id -> card resolution into the bounded cache. Never rejects. Ids the API did not
   * return are not cached (only skipped for CARD_RETRY_MS unless forced).
   */
  private requestCards(ids: readonly number[], force = false): Promise<void> {
    const now = performance.now();
    const missing = [...new Set(ids)].filter(
      (i) =>
        !this.cardCache.has(i) &&
        !this.cardRequests.has(i) &&
        (force || now - (this.cardMissAt.get(i) ?? -Infinity) >= CARD_RETRY_MS),
    );
    if (missing.length === 0) {
      return Promise.resolve();
    }
    missing.sort((a, b) => a - b);
    const request = firstValueFrom(
      this.api.getCardsByIds$(missing, 'en').pipe(
        timeout(RESOLVE_TIMEOUT_MS),
        defaultIfEmpty([] as YgoCard[]),
        catchError(() => of([] as YgoCard[])),
      ),
    )
      .then((cards) => {
        cards.forEach((card) => this.cacheCard(card));
        const at = performance.now();
        for (const i of missing) {
          if (this.cardCache.has(i)) {
            this.cardMissAt.delete(i);
          } else {
            this.cardMissAt.set(i, at);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => missing.forEach((i) => this.cardRequests.delete(i)));
    missing.forEach((i) => this.cardRequests.set(i, request));
    return request;
  }

  private cacheCard(card: YgoCard): void {
    this.cardCache.delete(card.id);
    this.cardCache.set(card.id, card);
    while (this.cardCache.size > CARD_CACHE_MAX) {
      const oldest = this.cardCache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.cardCache.delete(oldest);
    }
    if (this.cardMissAt.size > CARD_CACHE_MAX) {
      this.cardMissAt.clear();
    }
  }

  // ---------------------------------------------------------------- OCR pipeline (fallback)

  private async ocrTick(frame: HTMLCanvasElement, id: number): Promise<void> {
    const debugOn = this.debugEnabled();
    let key: string | null = null;
    let pass: ScanPass = 'none';
    let codeText = '';
    let nameText = '';
    let lastCrop: string | null = null;
    let read = '';

    const passes = this.setCodePasses(frame);
    for (const candidate of passes) {
      codeText = await this.ocr.recognizeText(candidate.canvas());
      if (id !== this.runId) {
        return;
      }
      if (debugOn) {
        lastCrop = this.band.toDataURL('image/png');
      }
      const parsed = parseSetCode(codeText);
      if (parsed) {
        pass = candidate.name;
        read = codeText;
        key = `code:${parsed.candidates[0]}|${parsed.language}`;
        this.remember(key, { kind: 'code', candidates: parsed.candidates, language: parsed.language });
        break;
      }
    }

    if (!key) {
      nameText = await this.ocr.recognizeText(this.cropPrepared(frame, NAME_BAND));
      if (id !== this.runId) {
        return;
      }
      if (debugOn) {
        lastCrop = this.band.toDataURL('image/png');
      }
      const name = cleanOcrName(nameText);
      if (name) {
        pass = 'name';
        read = name;
        const canonical = canonicalizeName(normalizeName(name), this.recentNames);
        if (canonical) {
          this.recentNames.push(canonical);
          this.recentNames = this.recentNames.slice(-RECENT_NAMES);
          key = `name:${canonical}`;
          // keep the longest raw text seen for this key: the cleanest string for the lookup
          const previous = this.seeds.get(key);
          const best = previous?.kind === 'name' && previous.text.length > name.length ? previous.text : name;
          this.remember(key, { kind: 'name', text: best });
        }
      }
    }

    this.lastRead.set(read.replace(/\s+/g, ' ').trim().slice(0, LAST_READ_MAX));

    if (debugOn) {
      const clip = (t: string) => t.trim().slice(0, DEBUG_TEXT_MAX);
      this.debug.set({ crop: lastCrop, codeText: clip(codeText), nameText: clip(nameText), pass, top5: '', sharpness: 0 });
    }

    const accepted = this.consensus.push(key, performance.now());
    if (accepted) {
      await this.resolve(accepted, id);
    }
  }

  /** Keeps a bounded set of seeds (most recently seen last). */
  private remember(key: string, seed: Seed): void {
    this.seeds.delete(key);
    this.seeds.set(key, seed);
    while (this.seeds.size > MAX_SEEDS) {
      const oldest = this.seeds.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.seeds.delete(oldest);
    }
  }

  private async resolve(key: string, id: number): Promise<void> {
    const seed = this.seeds.get(key);
    if (!seed) {
      return;
    }
    try {
      const source$: Observable<ScanMatch | null> =
        seed.kind === 'code' ? this.lookup.bySetCodes$(seed.candidates) : this.lookup.byName$(seed.text);
      const match = await firstValueFrom(
        source$.pipe(
          timeout(RESOLVE_TIMEOUT_MS),
          defaultIfEmpty(null as ScanMatch | null),
          catchError(() => of(null as ScanMatch | null)),
        ),
      );
      if (id !== this.runId) {
        return;
      }
      // The accepted key is settled either way; drop stale seeds.
      this.seeds.clear();
      this.recentNames = [];
      if (!match) {
        this.lastMiss.set(Date.now());
        return;
      }
      this.detectionSubject.next({
        card: match.card,
        printings: match.printings,
        setCode: match.setCode,
        language: seed.kind === 'code' ? seed.language : 'EN',
        source: seed.kind,
        needsReview: seed.kind === 'name' || match.printings.length !== 1,
        alternatives: [],
      });
    } catch {
      if (id === this.runId) {
        this.lastMiss.set(Date.now());
      }
    }
  }

  private grabFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      return null;
    }
    const guide = guideRect(vw, vh);
    this.frame.width = FRAME_WIDTH;
    this.frame.height = FRAME_HEIGHT;
    const ctx = this.frame.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    ctx.drawImage(video, guide.x * vw, guide.y * vh, guide.w * vw, guide.h * vh, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    return this.frame;
  }

  /**
   * Lazily-evaluated OCR passes over the set-code band: (a) grayscale + stretch,
   * (b) + Otsu binarization, (c) inverted binarization when the band is dark.
   * Each canvas() call renders its pass into the shared band canvas.
   */
  private setCodePasses(frame: HTMLCanvasElement): { name: ScanPass; canvas: () => HTMLCanvasElement }[] {
    const raw = this.cropRaw(frame, SET_CODE_BAND);
    if (!raw) {
      return [];
    }
    const { ctx, data } = raw;
    const render = (build: (px: Uint8ClampedArray) => void): HTMLCanvasElement => {
      const copy = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
      build(copy.data);
      ctx.putImageData(copy, 0, 0);
      return this.band;
    };
    const prepare = (px: Uint8ClampedArray) => stretchContrast(toGrayscale(px));
    const threshold = (px: Uint8ClampedArray, invert: boolean) => {
      prepare(px);
      binarize(px, otsuThreshold(px), invert);
    };
    const passes: { name: ScanPass; canvas: () => HTMLCanvasElement }[] = [
      { name: 'a', canvas: () => render(prepare) },
      { name: 'b', canvas: () => render((px) => threshold(px, false)) },
    ];
    if (meanLuminance(data.data) < DARK_BAND_LUMINANCE) {
      passes.push({ name: 'c', canvas: () => render((px) => threshold(px, true)) });
    }
    return passes;
  }

  private cropPrepared(frame: HTMLCanvasElement, band: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
    const raw = this.cropRaw(frame, band);
    if (raw) {
      const img = raw.data;
      stretchContrast(toGrayscale(img.data));
      raw.ctx.putImageData(img, 0, 0);
    }
    return this.band;
  }

  /** Draws the band, upscaled, into the shared canvas and returns its untouched pixels. */
  private cropRaw(
    frame: HTMLCanvasElement,
    band: { x: number; y: number; w: number; h: number },
  ): { ctx: CanvasRenderingContext2D; data: ImageData } | null {
    const sx = band.x * frame.width;
    const sy = band.y * frame.height;
    const sw = band.w * frame.width;
    const sh = band.h * frame.height;
    this.band.width = Math.round(sw * OCR_UPSCALE);
    this.band.height = Math.round(sh * OCR_UPSCALE);
    const ctx = this.band.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, this.band.width, this.band.height);
    return { ctx, data: ctx.getImageData(0, 0, this.band.width, this.band.height) };
  }
}
