import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';
import { YgoFormat } from '../models/ygo-format.model';

@Injectable({ providedIn: 'root' })
export class FormatConfigService {
  private formats: YgoFormat[] = [];
  private formats$Cache: Observable<YgoFormat[]> | null = null;

  constructor(private readonly http: HttpClient) {}

  loadFormats$(): Observable<YgoFormat[]> {
    if (!this.formats$Cache) {
      this.formats$Cache = this.http.get<YgoFormat[]>('/assets/data/formats.json').pipe(
        tap((formats) => {
          this.formats = formats;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }

    return this.formats$Cache;
  }

  getFormats(): YgoFormat[] {
    return this.formats;
  }

  getFormatById(id: string): YgoFormat | undefined {
    return this.formats.find((format) => format.id === id);
  }
}
