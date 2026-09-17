import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';
import { GateCardFacts } from './deck-builder-gate.util';

const CATALOG_URL = 'assets/data/deck-builder/catalog.json';

@Injectable({ providedIn: 'root' })
export class DeckBuilderCatalogService {
  private readonly http = inject(HttpClient);
  private catalog$: Observable<ReadonlyMap<number, GateCardFacts>> | null = null;

  loadCatalog$(): Observable<ReadonlyMap<number, GateCardFacts>> {
    if (!this.catalog$) {
      this.catalog$ = this.http.get<GateCardFacts[]>(CATALOG_URL).pipe(
        map((entries) => new Map(entries.map((entry) => [entry.id, entry]))),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.catalog$;
  }
}
