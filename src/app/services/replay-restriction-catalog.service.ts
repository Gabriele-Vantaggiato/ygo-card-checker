import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { RestrictionCatalog } from '../models/replay-restriction.model';
import { emptyCatalog } from '../features/replay/utils/restriction-engine';

const URL = '/assets/data/replay-restrictions.json';

@Injectable({ providedIn: 'root' })
export class ReplayRestrictionCatalogService {
  private readonly http = inject(HttpClient);
  private readonly catalogSignal = signal<RestrictionCatalog>(emptyCatalog());
  private load$: Observable<RestrictionCatalog> | null = null;

  catalog(): RestrictionCatalog {
    return this.catalogSignal();
  }

  ensureLoaded$(): Observable<RestrictionCatalog> {
    if (!this.load$) {
      this.load$ = this.http.get<RestrictionCatalog>(URL).pipe(
        tap((c) => this.catalogSignal.set(c)),
        catchError(() => {
          const empty = emptyCatalog();
          this.catalogSignal.set(empty);
          return of(empty);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.load$;
  }

  getCard(code: number) {
    return this.catalogSignal().cards[String(code)];
  }
}
