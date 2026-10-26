import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, catchError, defaultIfEmpty, firstValueFrom, of, timeout } from 'rxjs';
import { CardLanguage, ScanDetection } from '../models/collection.model';
import { cleanOcrName, normalizeName } from '../utils/name-match.utils';
import { ScanConsensus } from '../utils/scan-consensus.utils';
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

/** Regions of the guide frame, as fractions of the card. */
const SET_CODE_BAND = { x: 0.4, y: 0.6, w: 0.6, h: 0.14 };
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
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
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

    let key: string | null = null;
    const codeText = await this.ocr.recognizeText(this.crop(frame, SET_CODE_BAND));
    if (id !== this.runId) {
      return;
    }
    const parsed = parseSetCode(codeText);
    if (parsed) {
      key = `code:${parsed.candidates[0]}|${parsed.language}`;
      this.remember(key, { kind: 'code', candidates: parsed.candidates, language: parsed.language });
    } else {
      const nameText = await this.ocr.recognizeText(this.crop(frame, NAME_BAND));
      if (id !== this.runId) {
        return;
      }
      const name = cleanOcrName(nameText);
      if (name) {
        key = `name:${normalizeName(name).slice(0, NAME_KEY_LENGTH)}`;
        this.remember(key, { kind: 'name', text: name });
      }
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

  private crop(frame: HTMLCanvasElement, band: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
    const sx = band.x * frame.width;
    const sy = band.y * frame.height;
    const sw = band.w * frame.width;
    const sh = band.h * frame.height;
    this.band.width = Math.round(sw * OCR_UPSCALE);
    this.band.height = Math.round(sh * OCR_UPSCALE);
    const ctx = this.band.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      const hasFilter = (ctx as { filter?: string }).filter !== undefined;
      if (hasFilter) {
        ctx.filter = 'grayscale(1) contrast(1.6)';
      }
      ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, this.band.width, this.band.height);
      if (!hasFilter) {
        // Safari/iOS: ctx.filter unsupported, apply grayscale + contrast manually.
        const img = ctx.getImageData(0, 0, this.band.width, this.band.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = Math.max(0, Math.min(255, (gray - 128) * 1.6 + 128));
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(img, 0, 0);
      }
    }
    return this.band;
  }
}
