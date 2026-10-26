import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, catchError, defaultIfEmpty, firstValueFrom, of, timeout } from 'rxjs';
import { CardLanguage, ScanDetection } from '../models/collection.model';
import { cleanOcrName, normalizeName } from '../utils/name-match.utils';
import { ScanConsensus } from '../utils/scan-consensus.utils';
import { binarize, meanLuminance, otsuThreshold, stretchContrast, toGrayscale } from '../utils/image-preprocess.utils';
import { guideRect } from '../utils/scan-geometry.utils';
import { parseSetCode } from '../utils/set-code.utils';
import { CardScreenOcrService } from './card-screen-ocr.service';
import { CardsetLookupService, ScanMatch } from './cardset-lookup.service';

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = Math.round((FRAME_WIDTH * 86) / 59);
const TICK_MS = 300;
const OCR_UPSCALE = 2;
const NAME_KEY_LENGTH = 10;
const RESOLVE_TIMEOUT_MS = 8000;
const MAX_SEEDS = 20;
/** Below this mean luminance the band is dark (foil/dark frame): also try an inverted pass. */
const DARK_BAND_LUMINANCE = 110;
const DEBUG_TEXT_MAX = 80;

export type ScanPass = 'a' | 'b' | 'c' | 'name' | 'none';
export interface ScanDebug {
  crop: string | null;
  codeText: string;
  nameText: string;
  pass: string;
}

/**
 * Regions of the guide frame, as fractions of the card.
 * The set code sits under the artwork on the right, but its exact position varies between
 * card eras, so the band spans x 0.30..1.0 and y 0.58..0.80.
 */
const SET_CODE_BAND = { x: 0.3, y: 0.58, w: 0.7, h: 0.22 };
const NAME_BAND = { x: 0.03, y: 0.02, w: 0.94, h: 0.1 };

type Seed = { kind: 'code'; candidates: string[]; language: CardLanguage } | { kind: 'name'; text: string };

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'error';

/**
 * Camera loop for the collection scan: crops the on-screen guide frame, OCRs the
 * set code (fallback: the card name), debounces reads with ScanConsensus and
 * resolves accepted reads into cards. Emits one detection per accepted card.
 */
@Injectable({ providedIn: 'root' })
export class CollectionScannerService {
  private readonly ocr = inject(CardScreenOcrService);
  private readonly lookup = inject(CardsetLookupService);

  readonly state = signal<ScannerState>('idle');
  readonly error = signal<'denied' | 'unavailable' | null>(null);
  readonly lastMiss = signal(0);
  /** Diagnostics for tuning on real cards; no extra work is done while disabled. */
  readonly debugEnabled = signal(false);
  readonly debug = signal<ScanDebug | null>(null);

  private readonly detectionSubject = new Subject<ScanDetection>();
  readonly detections$: Observable<ScanDetection> = this.detectionSubject.asObservable();

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private running = false;
  /** Bumped by every start()/stop(); async work bails out when its captured id is stale. */
  private runId = 0;
  private consensus = this.newConsensus();
  private readonly seeds = new Map<string, Seed>();
  private readonly frame = document.createElement('canvas');
  private readonly band = document.createElement('canvas');

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    const id = ++this.runId;
    this.video = video;
    this.state.set('starting');
    this.error.set(null);
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
    this.state.set('idle');
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

    const debugOn = this.debugEnabled();
    let key: string | null = null;
    let pass: ScanPass = 'none';
    let codeText = '';
    let nameText = '';
    let lastCrop: string | null = null;

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
        key = `name:${normalizeName(name).slice(0, NAME_KEY_LENGTH)}`;
        this.remember(key, { kind: 'name', text: name });
      }
    }

    if (debugOn) {
      const clip = (t: string) => t.trim().slice(0, DEBUG_TEXT_MAX);
      this.debug.set({ crop: lastCrop, codeText: clip(codeText), nameText: clip(nameText), pass });
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
