import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { ComboFlow, ComboFlowIndex } from '../models/combo-flow.model';
import { ComboEngineService } from './combo-engine.service';
import { getAvailableFlows } from '../utils/combo-flow.utils';

const FLOWS_URL = 'assets/data/card-knowledge/flows.json';

/** Pillar 4 service. Only returns flows whose gate (Engine or key cards) is satisfied. */
@Injectable({ providedIn: 'root' })
export class ComboFlowService {
  private readonly http = inject(HttpClient);
  private readonly comboEngineService = inject(ComboEngineService);

  readonly flows$ = this.http.get<ComboFlowIndex>(FLOWS_URL).pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  getAvailableFlows(deckQuantities: ReadonlyMap<number, number>): Observable<ComboFlow[]> {
    const deckCardIds = new Set(deckQuantities.keys());
    return combineLatest([this.flows$, this.comboEngineService.detectEngines(deckQuantities)]).pipe(
      map(([index, detectedEngines]) => getAvailableFlows(deckCardIds, index?.flows ?? [], detectedEngines)),
    );
  }
}
