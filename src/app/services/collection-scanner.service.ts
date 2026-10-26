import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
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
  readonly busy = signal(false);
  readonly lastMiss = signal(0);

  private readonly detectionSubject = new Subject<ScanDetection>();
  readonly detections$: Observable<ScanDetection> = this.detectionSubject.asObservable();

  private stream: MediaStream | null = null;
  private running = false;
  private consensus = this.newConsensus();
  private readonly seeds = new Map<string, Seed>();
  private readonly frame = document.createElement('canvas');
  private readonly band = document.createElement('canvas');

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    this.state.set('starting');
    this.error.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err) {
      this.error.set(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      this.state.set('error');
      return;
    }
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);
    this.consensus = this.newConsensus();
    this.seeds.clear();
    this.running = true;
    this.state.set('scanning');
    void this.loop(video);
  }

  stop(): void {
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.state.set('idle');
  }

  private newConsensus(): ScanConsensus {
    return new ScanConsensus({ required: 2, windowSize: 4, cooldownMs: 1500 });
  }

  private async loop(video: HTMLVideoElement): Promise<void> {
    while (this.running) {
      const startedAt = performance.now();
      try {
        await this.tick(video);
      } catch (err) {
        console.error('[collection-scanner]', err);
      }
      const wait = Math.max(0, TICK_MS - (performance.now() - startedAt));
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  private async tick(video: HTMLVideoElement): Promise<void> {
    const frame = this.grabFrame(video);
    if (!frame) {
      return;
    }

    let key: string | null = null;
    const parsed = parseSetCode(await this.ocr.recognizeText(this.crop(frame, SET_CODE_BAND)));
    if (parsed) {
      key = `code:${parsed.candidates[0]}|${parsed.language}`;
      this.seeds.set(key, { kind: 'code', candidates: parsed.candidates, language: parsed.language });
    } else {
      const name = cleanOcrName(await this.ocr.recognizeText(this.crop(frame, NAME_BAND)));
      if (name) {
        key = `name:${normalizeName(name).slice(0, NAME_KEY_LENGTH)}`;
        this.seeds.set(key, { kind: 'name', text: name });
      }
    }

    const accepted = this.consensus.push(key, performance.now());
    if (accepted) {
      await this.resolve(accepted);
    }
  }

  private async resolve(key: string): Promise<void> {
    const seed = this.seeds.get(key);
    if (!seed) {
      return;
    }
    this.busy.set(true);
    try {
      const match: ScanMatch | null =
        seed.kind === 'code'
          ? await firstValueFrom(this.lookup.bySetCodes$(seed.candidates))
          : await firstValueFrom(this.lookup.byName$(seed.text));
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
    } finally {
      this.busy.set(false);
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
      ctx.filter = 'grayscale(1) contrast(1.6)';
      ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, this.band.width, this.band.height);
    }
    return this.band;
  }
}
