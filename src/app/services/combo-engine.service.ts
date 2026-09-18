import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { ComboEngineIndex, DetectedEngine } from '../models/combo-engine.model';
import { detectEngines } from '../utils/combo-engine-detection.utils';

const ENGINES_URL = 'assets/data/card-knowledge/engines.json';

/** Pillar 3 service. */
@Injectable({ providedIn: 'root' })
export class ComboEngineService {
  private readonly http = inject(HttpClient);

  readonly engines$ = this.http.get<ComboEngineIndex>(ENGINES_URL).pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  detectEngines(deckQuantities: ReadonlyMap<number, number>): Observable<DetectedEngine[]> {
    return this.engines$.pipe(map((index) => detectEngines(deckQuantities, index?.engines ?? [])));
  }
}
