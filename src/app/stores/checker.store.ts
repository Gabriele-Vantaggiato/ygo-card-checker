import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  BehaviorSubject,
  Subject,
  combineLatest,
  defaultIfEmpty,
} from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  skip,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { LegalityResult, YgoCard } from '../models/ygo-card.model';
import { YgoFormat } from '../models/ygo-format.model';
import { FormatConfigService } from '../services/format-config.service';
import { I18nService } from '../services/i18n.service';
import { LegalityService } from '../services/legality.service';
import { YgoApiService } from '../services/ygo-api.service';

interface SearchIntent {
  query: string;
  fromSelection: boolean;
}

interface SearchState {
  suggestions: YgoCard[];
  loading: boolean;
  error: string | null;
}

interface LegalityState {
  result: LegalityResult | null;
  error: string | null;
}

const EMPTY_SEARCH: SearchState = { suggestions: [], loading: false, error: null };
const EMPTY_LEGALITY: LegalityState = { result: null, error: null };

@Injectable()
export class CheckerStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formatConfig = inject(FormatConfigService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly legalityService = inject(LegalityService);
  private readonly i18n = inject(I18nService);

  private readonly searchQuery$ = new BehaviorSubject<string>('');
  private readonly searchIntent$ = new Subject<SearchIntent>();
  private readonly formatId$ = new BehaviorSubject<string>('hat');
  private readonly cardPick$ = new Subject<YgoCard>();
  private readonly searchStateSubject = new BehaviorSubject<SearchState>(EMPTY_SEARCH);
  private readonly selectedCardSubject = new BehaviorSubject<YgoCard | null>(null);
  private readonly legalityStateSubject = new BehaviorSubject<LegalityState>(EMPTY_LEGALITY);

  readonly formats$ = this.formatConfig.loadFormats$().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly formats = toSignal(this.formats$, { initialValue: [] as YgoFormat[] });
  readonly selectedFormatId = toSignal(this.formatId$, { initialValue: 'hat' });
  readonly searchQuery = toSignal(this.searchQuery$, { initialValue: '' });

  readonly selectedFormat$ = combineLatest([this.formats$, this.formatId$]).pipe(
    map(([formats, id]) => formats.find((f) => f.id === id) ?? null),
    distinctUntilChanged((a, b) => a?.id === b?.id),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly selectedFormat = toSignal(this.selectedFormat$, { initialValue: null as YgoFormat | null });

  readonly searchState$ = this.searchStateSubject.asObservable();
  readonly suggestions = toSignal(this.searchState$.pipe(map((s) => s.suggestions)), {
    initialValue: [] as YgoCard[],
  });
  readonly searchLoading = toSignal(this.searchState$.pipe(map((s) => s.loading)), {
    initialValue: false,
  });

  readonly selectedCard$ = this.selectedCardSubject.asObservable();
  readonly selectedCard = toSignal(this.selectedCard$, { initialValue: null as YgoCard | null });

  readonly legalityState$ = this.legalityStateSubject.asObservable();
  readonly legalityResult = toSignal(this.legalityState$.pipe(map((s) => s.result)), {
    initialValue: null as LegalityResult | null,
  });

  readonly error = toSignal(
    combineLatest([this.searchState$, this.legalityState$]).pipe(
      map(([search, legality]) => legality.error ?? search.error),
    ),
    { initialValue: null as string | null },
  );

  constructor() {
    this.bindFormatBootstrap();
    this.bindSearch();
    this.bindCardSelection();
    this.bindLegality();
    this.bindLanguageChange();
  }

  setSearchQuery(query: string): void {
    this.searchQuery$.next(query);
    this.searchIntent$.next({ query, fromSelection: false });
  }

  setFormatId(formatId: string): void {
    if (!formatId) {
      return;
    }
    this.formatId$.next(formatId);
  }

  selectCard(card: YgoCard): void {
    this.searchQuery$.next(card.name);
    this.searchIntent$.next({ query: card.name, fromSelection: true });
    this.cardPick$.next(card);
  }

  private bindFormatBootstrap(): void {
    this.formats$
      .pipe(
        map((formats) => {
          const current = this.formatId$.value;
          return formats.some((f) => f.id === current) ? current : (formats[0]?.id ?? '');
        }),
        filter((id) => id.length > 0),
        distinctUntilChanged(),
        tap((id) => this.formatId$.next(id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private bindSearch(): void {
    this.searchIntent$
      .pipe(
        debounceTime(300),
        tap((intent) => {
          if (intent.fromSelection || intent.query.trim().length < 2) {
            this.searchStateSubject.next(EMPTY_SEARCH);
          }
        }),
        filter((intent) => !intent.fromSelection && intent.query.trim().length >= 2),
        tap(() => {
          this.searchStateSubject.next({
            suggestions: [],
            loading: true,
            error: null,
          });
        }),
        switchMap((intent) =>
          this.ygoApi.searchCards$(intent.query.trim(), this.i18n.lang()).pipe(
            defaultIfEmpty([] as YgoCard[]),
            map((suggestions) => ({ suggestions, error: null as string | null })),
          ),
        ),
        tap({
          next: ({ suggestions, error }) => {
            this.searchStateSubject.next({ suggestions, loading: false, error });
          },
          error: () => {
            this.searchStateSubject.next({
              suggestions: [],
              loading: false,
              error: this.i18n.t('error.api'),
            });
          },
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private bindCardSelection(): void {
    this.cardPick$
      .pipe(
        switchMap((pick) =>
          this.ygoApi.getCardById$(pick.id, this.i18n.lang()).pipe(
            defaultIfEmpty(pick),
            map((full) => full ?? pick),
          ),
        ),
        tap((card) => {
          this.selectedCardSubject.next(card);
          this.searchQuery$.next(card.name);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private bindLegality(): void {
    combineLatest([this.selectedCard$, this.selectedFormat$])
      .pipe(
        tap(([card, format]) => {
          if (!card || !format) {
            this.legalityStateSubject.next(EMPTY_LEGALITY);
            return;
          }

          if (!this.legalityService.needsLocalBanlist(format)) {
            const result = this.legalityService.evaluate(
              card,
              format,
              this.legalityService.readBanlistFromCard(card, format),
            );
            this.legalityStateSubject.next({ result, error: null });
          }
        }),
        filter(
          ([card, format]) =>
            !!card && !!format && this.legalityService.needsLocalBanlist(format),
        ),
        switchMap(([card, format]) =>
          this.legalityService.evaluateWithLocalBanlist$(card!, format!),
        ),
        tap({
          next: (result) => {
            this.legalityStateSubject.next({ result, error: null });
          },
          error: () => {
            this.legalityStateSubject.next({
              result: null,
              error: this.i18n.t('error.generic'),
            });
          },
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private bindLanguageChange(): void {
    this.i18n.lang$
      .pipe(
        skip(1),
        withLatestFrom(this.searchQuery$, this.selectedCardSubject),
        tap(([, query, selected]) => {
          if (selected) {
            this.searchStateSubject.next(EMPTY_SEARCH);
            this.cardPick$.next(selected);
            return;
          }
          if (query.trim().length >= 2) {
            this.searchStateSubject.next(EMPTY_SEARCH);
          }
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}
