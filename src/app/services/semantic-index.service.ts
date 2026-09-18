import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { SemanticCardProfile, SemanticIndex } from '../models/semantic-card.model';

const SEMANTIC_URL = 'assets/data/card-knowledge/semantic.json';

/** Pillar 1 exposure: loads the per-card semantic profiles exported by export-semantic.ts. */
@Injectable({ providedIn: 'root' })
export class SemanticIndexService {
  private readonly http = inject(HttpClient);

  readonly semantic$ = this.http.get<SemanticIndex>(SEMANTIC_URL).pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly profileMap$: Observable<Map<number, SemanticCardProfile>> = this.semantic$.pipe(
    map((index) => {
      const map = new Map<number, SemanticCardProfile>();
      if (!index) {
        return map;
      }
      for (const [cardId, profile] of Object.entries(index.profiles)) {
        map.set(Number(cardId), profile);
      }
      return map;
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}
