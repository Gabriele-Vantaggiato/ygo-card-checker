import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators';
import { YgoFormat } from '../../models/ygo-format.model';
import { FormatConfigService } from '../../services/format-config.service';

const STORAGE_KEY = 'ygo-checker-format-id';

@Injectable({ providedIn: 'root' })
export class FormatStore {
  private readonly formatConfig = inject(FormatConfigService);

  private readonly formatsResource = signal<YgoFormat[]>([]);
  readonly formatId = signal(this.readStoredFormatId());

  readonly formats = this.formatsResource.asReadonly();

  /** @deprecated Prefer `formats` signal. */
  readonly formats$ = toObservable(this.formats).pipe(
    distinctUntilChanged((a, b) => a.length === b.length && a.every((f, i) => f.id === b[i]?.id)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly selectedFormat = computed((): YgoFormat | null => {
    const formats = this.formats();
    const id = this.formatId();
    return formats.find((f) => f.id === id) ?? formats[0] ?? null;
  });

  /** @deprecated Prefer `selectedFormat` signal. Kept for RxJS pipelines during migration. */
  readonly selectedFormat$ = toObservable(this.selectedFormat).pipe(
    distinctUntilChanged((a, b) => a?.id === b?.id),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** @deprecated Prefer `formatId` signal. */
  readonly formatId$ = toObservable(this.formatId).pipe(
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor() {
    this.formatConfig.loadFormats$().subscribe((formats) => {
      this.formatsResource.set(formats);
      const current = this.formatId();
      const resolved = formats.some((f) => f.id === current)
        ? current
        : (formats[0]?.id ?? '');
      if (resolved && resolved !== current) {
        this.setFormatId(resolved, false);
      }
    });
  }

  setFormatId(formatId: string, persist = true): void {
    if (!formatId || formatId === this.formatId()) {
      return;
    }
    this.formatId.set(formatId);
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, formatId);
      } catch {
        // private mode
      }
    }
  }

  private readStoredFormatId(): string {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored?.trim() || 'hat';
    } catch {
      return 'hat';
    }
  }
}
