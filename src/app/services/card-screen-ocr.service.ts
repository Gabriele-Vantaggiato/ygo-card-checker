import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  mdproIdentityKey,
  parseMdproOcrText,
} from '../utils/mdpro-ocr-parse';

export interface OcrSuccess {
  ok: true;
  text: string;
  parsed: ReturnType<typeof parseMdproOcrText>;
  identityKey: string;
  engine: 'native' | 'tesseract';
}

export interface OcrFailure {
  ok: false;
  errorKey: string;
}

export type OcrResult = OcrSuccess | OcrFailure;

type TesseractModule = typeof import('tesseract.js');

@Injectable({ providedIn: 'root' })
export class CardScreenOcrService {
  private workerPromise: Promise<import('tesseract.js').Worker> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  recognize$(source: HTMLCanvasElement): Observable<OcrResult> {
    this.bumpWorkerTtl();
    return from(this.runOcr(source)).pipe(
      map(({ text, engine }) => {
        const parsed = parseMdproOcrText(text);
        const identityKey = mdproIdentityKey(parsed);
        if (!identityKey) {
          return { ok: false as const, errorKey: 'overlay.error.cardNotFound' };
        }
        return { ok: true as const, text, parsed, identityKey, engine };
      }),
      catchError(() => of({ ok: false as const, errorKey: 'overlay.error.ocrFailed' })),
    );
  }

  async dispose(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    await this.terminateWorker();
  }

  private async runOcr(
    source: HTMLCanvasElement,
  ): Promise<{ text: string; engine: 'native' | 'tesseract' }> {
    const native = await tryNativeTextDetect(source);
    if (native && native.trim().length >= 3) {
      return { text: native, engine: 'native' };
    }
    const worker = await this.getWorker();
    const { data } = await worker.recognize(source);
    return { text: data.text ?? '', engine: 'tesseract' };
  }

  private getWorker(): Promise<import('tesseract.js').Worker> {
    if (!this.workerPromise) {
      this.workerPromise = this.createWorker();
    }
    return this.workerPromise;
  }

  private async createWorker(): Promise<import('tesseract.js').Worker> {
    const tesseract = (await import('tesseract.js')) as TesseractModule;
    // OEM 1 = LSTM only
    const worker = await tesseract.createWorker('eng', 1);
    await worker.setParameters({
      tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-\"'&.[]/ ",
    });
    return worker;
  }

  /** Free WASM worker after idle so live probing stays cool. */
  private bumpWorkerTtl(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      void this.terminateWorker();
    }, 20_000);
  }

  private async terminateWorker(): Promise<void> {
    if (!this.workerPromise) {
      return;
    }
    try {
      const worker = await this.workerPromise;
      await worker.terminate();
    } catch {
      // ignore
    }
    this.workerPromise = null;
  }
}

async function tryNativeTextDetect(source: HTMLCanvasElement): Promise<string | null> {
  const Ctor = window as unknown as {
    TextDetector?: new () => {
      detect: (input: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
  };
  if (!Ctor.TextDetector) {
    return null;
  }
  try {
    const detector = new Ctor.TextDetector();
    const texts = await detector.detect(source);
    const joined = texts
      .map((t) => t.rawValue ?? '')
      .filter(Boolean)
      .join('\n');
    return joined || null;
  } catch {
    return null;
  }
}
