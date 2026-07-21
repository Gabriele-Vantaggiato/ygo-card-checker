import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface CaptureFrame {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface CaptureCrop {
  /** 0–1 relative to frame */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Default crop: upper-center title bar of MDPRO card detail modal. */
export const MDPRO_TITLE_CROP: CaptureCrop = {
  x: 0.22,
  y: 0.12,
  w: 0.56,
  h: 0.18,
};

export interface ScreenCaptureStartResult {
  ok: true;
  stream: MediaStream;
  video: HTMLVideoElement;
}

export interface ScreenCaptureError {
  ok: false;
  errorKey: string;
}

@Injectable({ providedIn: 'root' })
export class ScreenCaptureService {
  isDisplayCaptureSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  }

  startDisplayCapture$(): Observable<ScreenCaptureStartResult | ScreenCaptureError> {
    if (!this.isDisplayCaptureSupported()) {
      return of({ ok: false, errorKey: 'overlay.error.captureUnsupported' });
    }

    // Keep constraints minimal — frameRate/max often throw OverconstrainedError on Windows.
    return from(
      navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      }),
    ).pipe(
      map((stream) => {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute('playsinline', 'true');
        void video.play();
        return { ok: true as const, stream, video };
      }),
      catchError((err: unknown) => of({ ok: false as const, errorKey: mapCaptureError(err) })),
    );
  }

  stopStream(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => track.stop());
  }

  grabCroppedFrame(video: HTMLVideoElement, crop: CaptureCrop = MDPRO_TITLE_CROP): CaptureFrame | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      return null;
    }

    const sx = Math.floor(vw * crop.x);
    const sy = Math.floor(vh * crop.y);
    const sw = Math.max(1, Math.floor(vw * crop.w));
    const sh = Math.max(1, Math.floor(vh * crop.h));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    return { canvas, width: sw, height: sh };
  }

  /** Prefer full-frame grab when crop would miss a shared window that isn't fullscreen. */
  grabFullFrame(video: HTMLVideoElement): CaptureFrame | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.drawImage(video, 0, 0);
    return { canvas, width: vw, height: vh };
  }

  /** Downscaled full frame for cheap probing (pixelmatch / heuristics). */
  grabScaledFrame(video: HTMLVideoElement, maxWidth = 320): CaptureFrame | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      return null;
    }
    const scale = Math.min(1, maxWidth / vw);
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.drawImage(video, 0, 0, w, h);
    return { canvas, width: w, height: h };
  }

  fileToCanvas$(file: File): Observable<CaptureFrame | { ok: false; errorKey: string }> {
    return from(this.bitmapToFrame(file)).pipe(
      catchError(() => of({ ok: false as const, errorKey: 'overlay.error.ocrFailed' })),
    );
  }

  clipboardImageToCanvas$(): Observable<CaptureFrame | { ok: false; errorKey: string }> {
    if (!navigator.clipboard?.read) {
      return of({ ok: false, errorKey: 'overlay.error.clipboardUnsupported' });
    }

    return from(
      navigator.clipboard.read().then(async (items) => {
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (!imageType) {
            continue;
          }
          const blob = await item.getType(imageType);
          return this.bitmapToFrame(blob);
        }
        return { ok: false as const, errorKey: 'overlay.error.clipboardEmpty' };
      }),
    ).pipe(
      catchError((err: unknown) =>
        of({ ok: false as const, errorKey: mapClipboardError(err) }),
      ),
    );
  }

  private async bitmapToFrame(
    source: Blob | ImageBitmapSource,
  ): Promise<CaptureFrame | { ok: false; errorKey: string }> {
    const bitmap = await createImageBitmap(source as ImageBitmapSource);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { ok: false, errorKey: 'overlay.error.ocrFailed' };
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { canvas, width: canvas.width, height: canvas.height };
  }
}

function mapCaptureError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'overlay.error.captureDenied';
  }
  if (name === 'NotFoundError' || name === 'NotReadableError') {
    return 'overlay.error.captureUnavailable';
  }
  if (name === 'OverconstrainedError' || name === 'TypeError') {
    return 'overlay.error.captureFailed';
  }
  return 'overlay.error.captureFailed';
}

function mapClipboardError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError') {
    return 'overlay.error.clipboardDenied';
  }
  return 'overlay.error.clipboardEmpty';
}
