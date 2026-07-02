import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { distinctUntilChanged, filter, map, shareReplay, tap } from 'rxjs/operators';
import { YgoFormat } from '../models/ygo-format.model';
import { FormatConfigService } from '../services/format-config.service';

const STORAGE_KEY = 'ygo-checker-format-id';

@Injectable({ providedIn: 'root' })
export class FormatStore {
  private readonly formatConfig = inject(FormatConfigService);
  private readonly formatIdSubject = new BehaviorSubject<string>(this.readStoredFormatId());

  readonly formats$ = this.formatConfig.loadFormats$().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly formats = toSignal(this.formats$, { initialValue: [] as YgoFormat[] });
  readonly formatId$ = this.formatIdSubject.asObservable();
  readonly formatId = toSignal(this.formatId$, { initialValue: this.formatIdSubject.value });

  readonly selectedFormat$ = combineLatest([this.formats$, this.formatId$]).pipe(
    map(([formats, id]): YgoFormat | null => {
      const selected = formats.find((f) => f.id === id);
      if (selected) {
        return selected;
      }
      return formats[0] ?? null;
    }),
    distinctUntilChanged((a, b) => a?.id === b?.id),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly selectedFormat = toSignal(this.selectedFormat$, { initialValue: null as YgoFormat | null });

  constructor() {
    this.formats$
      .pipe(
        map((formats) => {
          const current = this.formatIdSubject.value;
          return formats.some((f) => f.id === current) ? current : (formats[0]?.id ?? '');
        }),
        filter((id) => id.length > 0),
        distinctUntilChanged(),
        tap((id) => this.setFormatId(id, false)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  setFormatId(formatId: string, persist = true): void {
    if (!formatId || formatId === this.formatIdSubject.value) {
      return;
    }
    this.formatIdSubject.next(formatId);
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
