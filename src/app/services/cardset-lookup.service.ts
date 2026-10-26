import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, concatMap, first, map, switchMap } from 'rxjs/operators';
import { CardSet, YgoCard } from '../models/ygo-card.model';
import { bestNameMatch } from '../utils/name-match.utils';
import { YgoApiService } from './ygo-api.service';

const SET_INFO_URL = 'https://db.ygoprodeck.com/api/v7/cardsetsinfo.php';
const NO_SET_CODE = 'N/D';

export interface ScanMatch {
  card: YgoCard;
  printings: CardSet[];
  setCode: string;
}

@Injectable({ providedIn: 'root' })
export class CardsetLookupService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(YgoApiService);

  /** Tries each candidate code in order and returns the first card found. */
  bySetCodes$(codes: readonly string[]): Observable<ScanMatch | null> {
    return from(codes).pipe(
      concatMap((code) => this.bySetCode$(code)),
      first((match) => match !== null, null),
    );
  }

  /** Fuzzy name path: the printing is unknown, so the first printing is a default to review. */
  byName$(ocrName: string): Observable<ScanMatch | null> {
    return this.api.searchCards$(ocrName, 'it', 20).pipe(
      map((cards) => bestNameMatch(ocrName, cards)),
      switchMap((hit) => (hit ? this.api.getCardById$(hit.id, 'en') : of(null))),
      map((card) => {
        if (!card) {
          return null;
        }
        const printings = card.card_sets ?? [];
        return { card, printings, setCode: printings[0]?.set_code ?? NO_SET_CODE };
      }),
      catchError(() => of(null)),
    );
  }

  private bySetCode$(code: string): Observable<ScanMatch | null> {
    const url = `${SET_INFO_URL}?setcode=${encodeURIComponent(code)}`;
    return this.http.get<{ id?: number }>(url).pipe(
      switchMap((res) => (res?.id ? this.api.getCardById$(res.id, 'en') : of(null))),
      map((card) => {
        if (!card) {
          return null;
        }
        const printings = (card.card_sets ?? []).filter((set) => set.set_code.toUpperCase() === code);
        return { card, printings, setCode: code };
      }),
      catchError(() => of(null)),
    );
  }
}
