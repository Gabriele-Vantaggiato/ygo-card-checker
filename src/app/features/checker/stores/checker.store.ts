import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, defaultIfEmpty, forkJoin, of, Subject } from 'rxjs';
import {
  catchError,
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
import { LegalityResult, YgoCard } from '../../../models/ygo-card.model';
import { SearchHistoryEntry } from '../../../models/search-history.model';
import { YgoFormat } from '../../../models/ygo-format.model';
import { CardRelatedResult } from '../../../models/card-knowledge.model';
import { I18nService } from '../../../services/i18n.service';
import { CardKnowledgeService } from '../../../services/card-knowledge.service';
import { CardLegalityFacade } from '../../../services/card-legality.facade';
import { YgoApiService } from '../../../services/ygo-api.service';
import { FormatStore } from '../../../core/stores/format.store';
import { sortYgoCardsByPlayability } from '../../../utils/card-sort.utils';

interface SearchIntent {
  query: string;
  fromSelection: boolean;
}

interface SearchState {
  suggestions: YgoCard[];
  suggestionLegality: Map<number, LegalityResult>;
  loading: boolean;
  legalityLoading: boolean;
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

const EMPTY_SEARCH: SearchState = {
  suggestions: [],
  suggestionLegality: new Map(),
  loading: false,
  legalityLoading: false,
  error: null,
};
const EMPTY_LEGALITY: LegalityState = { result: null, error: null };
const EMPTY_RELATED: CardRelatedResult = {
  tags: [],
  displayTags: [],
  series: [],
  mentions: [],
  effects: [],
  suggestions: [],
  groups: [],
  available: false,
};
const HISTORY_STORAGE_KEY = 'ygo-checker-search-history';
const MAX_HISTORY = 8;

@Injectable()
export class CheckerStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formatStore = inject(FormatStore);
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly knowledgeService = inject(CardKnowledgeService);
  private readonly i18n = inject(I18nService);

  private readonly searchIntent$ = new Subject<SearchIntent>();
  private readonly cardPick$ = new Subject<YgoCard>();
  private readonly cardCache = new Map<number, YgoCard>();

  private readonly searchState = signal<SearchState>(EMPTY_SEARCH);
  private readonly legalityState = signal<LegalityState>(EMPTY_LEGALITY);
  private readonly relatedState = signal<RelatedState>({
    result: EMPTY_RELATED,
    loading: false,
  });

  readonly formats = this.formatStore.formats;
  readonly selectedFormatId = this.formatStore.formatId;
  readonly searchQuery = signal('');
  readonly selectedFormat$ = this.formatStore.selectedFormat$;
  readonly selectedFormat = this.formatStore.selectedFormat;

  readonly suggestions = computed(() => this.searchState().suggestions);
  readonly searchLoading = computed(() => this.searchState().loading);
  readonly suggestionLegalityLoading = computed(() => this.searchState().legalityLoading);
  readonly suggestionLegality = computed(() => this.searchState().suggestionLegality);

  readonly selectedCard = signal<YgoCard | null>(null);
  private readonly selectedCard$ = toObservable(this.selectedCard);

  readonly legalityResult = computed(() => this.legalityState().result);

  readonly relatedLoading = computed(() => this.relatedState().loading);
  readonly relatedAvailable = computed(() => this.relatedState().result.available);
  readonly relatedSeries = computed(() => this.relatedState().result.series);
  readonly relatedTags = computed(() => this.relatedState().result.displayTags);
  readonly relatedMentions = computed(() => this.relatedState().result.mentions);
  readonly relatedEffects = computed(() => this.relatedState().result.effects);
  readonly relatedSuggestions = computed(() => this.relatedState().result.suggestions);
  readonly relatedGroups = computed(() => this.relatedState().result.groups);

  readonly error = computed(
    () => this.legalityState().error ?? this.searchState().error,
  );

  readonly searchHistory = signal<SearchHistoryEntry[]>(this.loadSearchHistory());

  constructor() {
    this.bindSearch();
    this.bindSuggestionLegalityRefresh();
    this.bindCardSelection();
    this.bindLegality();
    this.bindRelated();
    this.bindHistoryRefresh();
    this.bindLanguageChange();
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.searchIntent$.next({ query, fromSelection: false });
  }

  setFormatId(formatId: string): void {
    this.formatStore.setFormatId(formatId);
  }

  selectCard(card: YgoCard): void {
    this.searchQuery.set(card.name);
    this.searchIntent$.next({ query: card.name, fromSelection: true });
    this.cardPick$.next(card);
  }

  selectFromHistory(entry: SearchHistoryEntry): void {
    this.selectCard(this.toYgoCard(entry));
  }

  openCardById(cardId: number): void {
    this.ygoApi
      .getCardById$(cardId, this.i18n.lang())
      .pipe(defaultIfEmpty(null), take(1), takeUntilDestroyed(this.destroyRef))
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
    this.searchHistory.set([]);
    this.persistSearchHistory([]);
  }

  removeSearchHistoryEntry(cardId: number): void {
    const next = this.searchHistory().filter((item) => item.id !== cardId);
    this.searchHistory.set(next);
    this.persistSearchHistory(next);

    if (this.selectedCard()?.id === cardId) {
      this.selectedCard.set(null);
      this.searchQuery.set('');
      this.legalityState.set(EMPTY_LEGALITY);
      this.relatedState.set({ result: EMPTY_RELATED, loading: false });
    }
  }

  private bindSearch(): void {
    this.searchIntent$
      .pipe(
        debounceTime(300),
        tap((intent) => {
          if (intent.fromSelection || intent.query.trim().length < 2) {
            this.searchState.set(EMPTY_SEARCH);
          }
        }),
        filter((intent) => !intent.fromSelection && intent.query.trim().length >= 2),
        tap(() => {
          this.searchState.set({
            ...EMPTY_SEARCH,
            loading: true,
          });
        }),
        switchMap((intent) =>
          this.ygoApi.searchCards$(intent.query.trim(), this.i18n.lang()).pipe(
            defaultIfEmpty([] as YgoCard[]),
            map((suggestions) => ({ suggestions, error: null as string | null })),
          ),
        ),
        switchMap(({ suggestions, error }) => {
          if (suggestions.length === 0) {
            return of({
              suggestions,
              suggestionLegality: new Map<number, LegalityResult>(),
              error,
            });
          }

          this.searchState.set({
            ...this.searchState(),
            suggestions,
            loading: false,
            legalityLoading: true,
            error,
          });

          return this.evaluateSuggestions$(suggestions).pipe(
            map((evaluated) => ({ ...evaluated, error })),
          );
        }),
        tap({
          next: ({ suggestions, suggestionLegality, error }) => {
            this.searchState.set({
              suggestions,
              suggestionLegality,
              loading: false,
              legalityLoading: false,
              error,
            });
          },
          error: () => {
            this.searchState.set({
              ...EMPTY_SEARCH,
              error: this.i18n.t('error.api'),
            });
          },
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private bindSuggestionLegalityRefresh(): void {
    this.formatStore.formatId$
      .pipe(
        skip(1),
        distinctUntilChanged(),
        withLatestFrom(toObservable(this.searchState)),
        filter(([, state]) => state.suggestions.length > 0),
        tap(([, state]) => {
          this.searchState.set({
            ...state,
            legalityLoading: true,
          });
        }),
        switchMap(([, state]) => this.evaluateSuggestions$(state.suggestions)),
        tap(({ suggestions, suggestionLegality }) => {
          this.searchState.set({
            ...this.searchState(),
            suggestions,
            suggestionLegality,
            legalityLoading: false,
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private evaluateSuggestions$(suggestions: YgoCard[]) {
    return this.selectedFormat$.pipe(
      take(1),
      switchMap((format) => {
        if (!format || suggestions.length === 0) {
          return of({
            suggestions,
            suggestionLegality: new Map<number, LegalityResult>(),
          });
        }

        return this.cardLegality.evaluateMany$(suggestions, format).pipe(
          map((suggestionLegality) => ({
            suggestions: sortYgoCardsByPlayability(suggestions, suggestionLegality),
            suggestionLegality,
          })),
          // Keep search hits even if banlist evaluation fails for one/all cards.
          catchError(() =>
            of({
              suggestions,
              suggestionLegality: new Map<number, LegalityResult>(),
            }),
          ),
        );
      }),
    );
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
          this.selectedCard.set(card);
          this.searchQuery.set(card.name);
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
            this.legalityState.set(EMPTY_LEGALITY);
          }
        }),
        filter(([card, format]) => !!card && !!format),
        switchMap(([card, format]) =>
          this.cardLegality.evaluate$(card!, format!).pipe(
            map((result) => ({ card: card!, format: format!, result })),
          ),
        ),
        tap({
          next: ({ card, format, result }) => {
            this.legalityState.set({ result, error: null });
            this.upsertHistoryEntry(card, format, result);
          },
          error: () => {
            this.legalityState.set({
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
            this.relatedState.set({ result: EMPTY_RELATED, loading: false });
          }
        }),
        filter(([card, format]) => !!card && !!format),
        tap(() => {
          this.relatedState.set({ result: EMPTY_RELATED, loading: true });
        }),
        switchMap(([card, format]) =>
          this.knowledgeService.findRelated$(card!, format!).pipe(
            map((result) => ({ result, loading: false })),
          ),
        ),
        tap({
          next: (state) => this.relatedState.set(state),
          error: () =>
            this.relatedState.set({ result: EMPTY_RELATED, loading: false }),
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
          if (!format || this.searchHistory().length === 0) {
            return of(this.searchHistory());
          }
          return this.recomputeHistory$(format);
        }),
        tap((entries) => {
          this.searchHistory.set(entries);
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
        withLatestFrom(toObservable(this.searchQuery), toObservable(this.selectedCard)),
        tap(([, query, selected]) => {
          if (selected) {
            this.searchState.set(EMPTY_SEARCH);
            this.cardPick$.next(selected);
            return;
          }
          if (query.trim().length >= 2) {
            this.searchState.set(EMPTY_SEARCH);
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
      ...this.searchHistory().filter((item) => item.id !== entry.id),
    ].slice(0, MAX_HISTORY);
    this.searchHistory.set(next);
    this.persistSearchHistory(next);
  }

  private recomputeHistory$(format: YgoFormat) {
    const entries = this.searchHistory();
    if (entries.length === 0) {
      return of([] as SearchHistoryEntry[]);
    }

    return forkJoin(
      entries.map((entry) => {
        const card = this.cardCache.get(entry.id);
        if (!card) {
          return of({ ...entry, formatId: format.id, verdict: null, banlistStatus: null });
        }

        return this.cardLegality.evaluate$(card, format).pipe(
          map((result) => this.toHistoryEntry(card, format.id, result)),
        );
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
