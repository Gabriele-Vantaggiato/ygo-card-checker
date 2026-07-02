import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  BehaviorSubject,
  Subject,
  combineLatest,
  defaultIfEmpty,
  forkJoin,
  of,
} from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  skip,
  switchMap,
  take,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { LegalityResult, YgoCard } from '../models/ygo-card.model';
import { SearchHistoryEntry } from '../models/search-history.model';
import { YgoFormat } from '../models/ygo-format.model';
import { CardRelatedResult } from '../models/card-knowledge.model';
import { I18nService } from '../services/i18n.service';
import { CardKnowledgeService } from '../services/card-knowledge.service';
import { LegalityService } from '../services/legality.service';
import { YgoApiService } from '../services/ygo-api.service';
import { FormatStore } from './format.store';

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

interface RelatedState {
  result: CardRelatedResult;
  loading: boolean;
}

const EMPTY_SEARCH: SearchState = { suggestions: [], loading: false, error: null };
const EMPTY_LEGALITY: LegalityState = { result: null, error: null };
const EMPTY_RELATED: CardRelatedResult = { tags: [], series: [], suggestions: [], available: false };
const HISTORY_STORAGE_KEY = 'ygo-checker-search-history';
const MAX_HISTORY = 10;

@Injectable()
export class CheckerStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formatStore = inject(FormatStore);
  private readonly ygoApi = inject(YgoApiService);
  private readonly legalityService = inject(LegalityService);
  private readonly knowledgeService = inject(CardKnowledgeService);
  private readonly i18n = inject(I18nService);

  private readonly searchQuery$ = new BehaviorSubject<string>('');
  private readonly searchIntent$ = new Subject<SearchIntent>();
  private readonly cardPick$ = new Subject<YgoCard>();
  private readonly searchStateSubject = new BehaviorSubject<SearchState>(EMPTY_SEARCH);
  private readonly selectedCardSubject = new BehaviorSubject<YgoCard | null>(null);
  private readonly legalityStateSubject = new BehaviorSubject<LegalityState>(EMPTY_LEGALITY);
  private readonly relatedStateSubject = new BehaviorSubject<RelatedState>({
    result: EMPTY_RELATED,
    loading: false,
  });
  private readonly searchHistorySubject = new BehaviorSubject<SearchHistoryEntry[]>(
    this.loadSearchHistory(),
  );
  private readonly cardCache = new Map<number, YgoCard>();

  readonly formats = this.formatStore.formats;
  readonly selectedFormatId = this.formatStore.formatId;
  readonly searchQuery = toSignal(this.searchQuery$, { initialValue: '' });

  readonly selectedFormat$ = this.formatStore.selectedFormat$;
  readonly selectedFormat = this.formatStore.selectedFormat;

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

  readonly relatedState$ = this.relatedStateSubject.asObservable();
  readonly relatedLoading = toSignal(this.relatedState$.pipe(map((s) => s.loading)), {
    initialValue: false,
  });
  readonly relatedAvailable = toSignal(this.relatedState$.pipe(map((s) => s.result.available)), {
    initialValue: false,
  });
  readonly relatedSeries = toSignal(this.relatedState$.pipe(map((s) => s.result.series)), {
    initialValue: EMPTY_RELATED.series,
  });
  readonly relatedTags = toSignal(this.relatedState$.pipe(map((s) => s.result.tags)), {
    initialValue: EMPTY_RELATED.tags,
  });
  readonly relatedSuggestions = toSignal(this.relatedState$.pipe(map((s) => s.result.suggestions)), {
    initialValue: EMPTY_RELATED.suggestions,
  });

  readonly error = toSignal(
    combineLatest([this.searchState$, this.legalityState$]).pipe(
      map(([search, legality]) => legality.error ?? search.error),
    ),
    { initialValue: null as string | null },
  );

  readonly searchHistory = toSignal(this.searchHistorySubject, {
    initialValue: [] as SearchHistoryEntry[],
  });

  constructor() {
    this.bindSearch();
    this.bindCardSelection();
    this.bindLegality();
    this.bindRelated();
    this.bindHistoryRefresh();
    this.bindLanguageChange();
  }

  setSearchQuery(query: string): void {
    this.searchQuery$.next(query);
    this.searchIntent$.next({ query, fromSelection: false });
  }

  setFormatId(formatId: string): void {
    this.formatStore.setFormatId(formatId);
  }

  selectCard(card: YgoCard): void {
    this.searchQuery$.next(card.name);
    this.searchIntent$.next({ query: card.name, fromSelection: true });
    this.cardPick$.next(card);
  }

  selectFromHistory(entry: SearchHistoryEntry): void {
    this.selectCard(this.toYgoCard(entry));
  }

  openCardById(cardId: number): void {
    this.ygoApi
      .getCardById$(cardId, this.i18n.lang())
      .pipe(defaultIfEmpty(null), take(1))
      .subscribe((card) => {
        if (card) {
          this.selectCard(card);
        }
      });
  }

  openRelatedCard(cardId: number): void {
    this.openCardById(cardId);
  }

  clearSearchHistory(): void {
    this.searchHistorySubject.next([]);
    this.persistSearchHistory([]);
  }

  removeSearchHistoryEntry(cardId: number): void {
    const next = this.searchHistorySubject.value.filter((item) => item.id !== cardId);
    this.searchHistorySubject.next(next);
    this.persistSearchHistory(next);

    if (this.selectedCardSubject.value?.id === cardId) {
      this.selectedCardSubject.next(null);
      this.searchQuery$.next('');
      this.legalityStateSubject.next(EMPTY_LEGALITY);
      this.relatedStateSubject.next({ result: EMPTY_RELATED, loading: false });
    }
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
          this.cardCache.set(card.id, card);
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
            this.upsertHistoryEntry(card, format, result);
          }
        }),
        filter(
          ([card, format]) =>
            !!card && !!format && this.legalityService.needsLocalBanlist(format),
        ),
        switchMap(([card, format]) =>
          this.legalityService.evaluateWithLocalBanlist$(card!, format!).pipe(
            map((result) => ({ card: card!, format: format!, result })),
          ),
        ),
        tap({
          next: ({ card, format, result }) => {
            this.legalityStateSubject.next({ result, error: null });
            this.upsertHistoryEntry(card, format, result);
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

  private bindRelated(): void {
    combineLatest([this.selectedCard$, this.selectedFormat$])
      .pipe(
        tap(([card, format]) => {
          if (!card || !format) {
            this.relatedStateSubject.next({ result: EMPTY_RELATED, loading: false });
          }
        }),
        filter(([card, format]) => !!card && !!format),
        tap(() => {
          this.relatedStateSubject.next({ result: EMPTY_RELATED, loading: true });
        }),
        switchMap(([card, format]) =>
          this.knowledgeService.findRelated$(card!, format!).pipe(
            map((result) => ({ result, loading: false })),
          ),
        ),
        tap({
          next: (state) => this.relatedStateSubject.next(state),
          error: () =>
            this.relatedStateSubject.next({ result: EMPTY_RELATED, loading: false }),
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private bindHistoryRefresh(): void {
    this.formatStore.formatId$
      .pipe(
        skip(1),
        distinctUntilChanged(),
        withLatestFrom(this.formatStore.formats$),
        switchMap(([formatId, formats]) => {
          const format = formats.find((f) => f.id === formatId);
          if (!format || this.searchHistorySubject.value.length === 0) {
            return of(this.searchHistorySubject.value);
          }
          return this.recomputeHistory$(format);
        }),
        tap((entries) => {
          this.searchHistorySubject.next(entries);
          this.persistSearchHistory(entries);
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

  private upsertHistoryEntry(card: YgoCard, format: YgoFormat, result: LegalityResult): void {
    const entry = this.toHistoryEntry(card, format.id, result);
    const next = [
      entry,
      ...this.searchHistorySubject.value.filter((item) => item.id !== entry.id),
    ].slice(0, MAX_HISTORY);
    this.searchHistorySubject.next(next);
    this.persistSearchHistory(next);
  }

  private recomputeHistory$(format: YgoFormat) {
    const entries = this.searchHistorySubject.value;
    if (entries.length === 0) {
      return of([] as SearchHistoryEntry[]);
    }

    return forkJoin(
      entries.map((entry) => {
        const card = this.cardCache.get(entry.id);
        if (!card) {
          return of({ ...entry, formatId: format.id, verdict: null, banlistStatus: null });
        }

        if (this.legalityService.needsLocalBanlist(format)) {
          return this.legalityService.evaluateWithLocalBanlist$(card, format).pipe(
            map((result) => this.toHistoryEntry(card, format.id, result)),
          );
        }

        const result = this.legalityService.evaluate(
          card,
          format,
          this.legalityService.readBanlistFromCard(card, format),
        );
        return of(this.toHistoryEntry(card, format.id, result));
      }),
    );
  }

  private toHistoryEntry(
    card: YgoCard,
    formatId: string,
    result: LegalityResult,
  ): SearchHistoryEntry {
    return {
      id: card.id,
      name: card.name,
      type: card.type,
      imageUrlSmall: card.card_images?.[0]?.image_url_small ?? null,
      formatId,
      verdict: result.verdict,
      banlistStatus: result.banlistStatus,
    };
  }

  private toYgoCard(entry: SearchHistoryEntry): YgoCard {
    const imageUrl = entry.imageUrlSmall ?? '';
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      desc: '',
      card_images: imageUrl
        ? [{ id: entry.id, image_url: imageUrl, image_url_small: imageUrl }]
        : [],
    };
  }

  private loadSearchHistory(): SearchHistoryEntry[] {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as SearchHistoryEntry[];
      return Array.isArray(parsed)
        ? parsed.slice(0, MAX_HISTORY).map((entry) => ({
            ...entry,
            formatId: entry.formatId ?? '',
            verdict: entry.verdict ?? null,
            banlistStatus: entry.banlistStatus ?? null,
          }))
        : [];
    } catch {
      return [];
    }
  }

  private persistSearchHistory(entries: SearchHistoryEntry[]): void {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // quota / private mode — in-memory only
    }
  }
}
