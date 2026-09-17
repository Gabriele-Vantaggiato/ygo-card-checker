import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { CardSearchFacade } from './card-search.facade';
import { CardSearchIndexService, SearchIndexEntry } from './card-search-index.service';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { YgoApiService } from './ygo-api.service';
import { YgoCard } from '../models/ygo-card.model';

function card(id: number, name: string): YgoCard {
  return { id, name, type: 'Effect Monster', desc: 'x', card_images: [] };
}

describe('CardSearchFacade', () => {
  let facade: CardSearchFacade;
  let indexService: jasmine.SpyObj<CardSearchIndexService>;
  let ygoApi: jasmine.SpyObj<YgoApiService>;
  let knowledgeIndex: jasmine.SpyObj<Pick<CardKnowledgeIndexService, 'formatLegality$'>> & {
    formatLegality$: unknown;
  };

  beforeEach(() => {
    indexService = jasmine.createSpyObj('CardSearchIndexService', ['loadIndex$', 'filterIndex', 'sortIdsWithin']);
    ygoApi = jasmine.createSpyObj('YgoApiService', ['getCardsByIds$', 'searchCards$']);
    knowledgeIndex = { formatLegality$: of(null) } as unknown as jasmine.SpyObj<Pick<CardKnowledgeIndexService, 'formatLegality$'>> & {
      formatLegality$: unknown;
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CardSearchFacade,
        { provide: CardSearchIndexService, useValue: indexService },
        { provide: YgoApiService, useValue: ygoApi },
        { provide: CardKnowledgeIndexService, useValue: knowledgeIndex },
      ],
    });
    facade = TestBed.inject(CardSearchFacade);
  });

  describe('browseFormat$', () => {
    it('builds the id set from cards playable in the given format and hydrates the page', () => {
      const entries: SearchIndexEntry[] = [];
      indexService.loadIndex$.and.returnValue(of(entries));
      knowledgeIndex.formatLegality$ = of({
        version: 1,
        generatedAt: '',
        formats: ['hat', 'tcg'],
        playable: { '10': ['hat', 'tcg'], '20': ['tcg'], '30': ['hat'] },
        maxCopies: {},
      });
      indexService.sortIdsWithin.and.returnValue([10, 30]);
      ygoApi.getCardsByIds$.and.returnValue(of([card(10, 'A'), card(30, 'C')]));

      let result: { cards: YgoCard[]; totalRows: number; hasMore: boolean } | undefined;
      facade.browseFormat$('hat', 'en', 20, 0).subscribe((page) => (result = page));

      expect(indexService.sortIdsWithin).toHaveBeenCalledWith(entries, new Set([10, 30]));
      expect(result).toEqual({ cards: [card(10, 'A'), card(30, 'C')], totalRows: 2, hasMore: false });
    });

    it('yields an empty page when the format legality index failed to load', () => {
      indexService.loadIndex$.and.returnValue(of([]));
      indexService.sortIdsWithin.and.returnValue([]);
      knowledgeIndex.formatLegality$ = of(null);

      let result: { cards: YgoCard[]; totalRows: number; hasMore: boolean } | undefined;
      facade.browseFormat$('hat', 'en', 20, 0).subscribe((page) => (result = page));

      expect(ygoApi.getCardsByIds$).not.toHaveBeenCalled();
      expect(indexService.sortIdsWithin).toHaveBeenCalledWith([], new Set());
      expect(result).toEqual({ cards: [], totalRows: 0, hasMore: false });
    });

    it('paginates the browse list like searchAdvanced$', () => {
      indexService.loadIndex$.and.returnValue(of([]));
      knowledgeIndex.formatLegality$ = of({
        version: 1,
        generatedAt: '',
        formats: ['hat'],
        playable: { '10': ['hat'], '20': ['hat'], '30': ['hat'] },
        maxCopies: {},
      });
      indexService.sortIdsWithin.and.returnValue([10, 20, 30]);
      ygoApi.getCardsByIds$.and.returnValue(of([card(20, 'B')]));

      let result: { cards: YgoCard[]; totalRows: number; hasMore: boolean } | undefined;
      facade.browseFormat$('hat', 'en', 1, 1).subscribe((page) => (result = page));

      expect(ygoApi.getCardsByIds$).toHaveBeenCalledWith([20], 'en');
      expect(result?.totalRows).toBe(3);
      expect(result?.hasMore).toBeTrue();
    });
  });

  describe('searchCombined$', () => {
    it('merges live name matches (IT/EN-aware) with local effect-text matches, deduped', () => {
      const entries: SearchIndexEntry[] = [];
      ygoApi.searchCards$.and.returnValue(of([card(1, 'Fioritura di Cenere')])); // IT name match, only findable via the live API
      indexService.loadIndex$.and.returnValue(of(entries));
      indexService.filterIndex.and.returnValue([2]); // effect-text match found only in the local index
      indexService.sortIdsWithin.and.returnValue([1, 2]); // merged set, sorted
      ygoApi.getCardsByIds$.and.returnValue(of([card(1, 'Ash Blossom & Joyous Spring'), card(2, 'Effect Veiler')]));

      let result: { cards: YgoCard[]; totalRows: number; hasMore: boolean } | undefined;
      facade.searchCombined$('cenere', {}, 'it', 20, 0).subscribe((page) => (result = page));

      expect(ygoApi.searchCards$).toHaveBeenCalledWith('cenere', 'it');
      expect(indexService.filterIndex).toHaveBeenCalledWith(entries, 'cenere', {});
      expect(indexService.sortIdsWithin).toHaveBeenCalledWith(entries, new Set([1, 2]));
      expect(result?.cards.map((c) => c.id)).toEqual([1, 2]);
    });

    it('drops live name matches that do not satisfy the active advanced filters', () => {
      const entries: SearchIndexEntry[] = [];
      ygoApi.searchCards$.and.returnValue(of([{ ...card(1, 'Blue-Eyes White Dragon'), type: 'Normal Monster' }]));
      indexService.loadIndex$.and.returnValue(of(entries));
      indexService.filterIndex.and.returnValue([]);
      indexService.sortIdsWithin.and.returnValue([]);

      let result: { cards: YgoCard[]; totalRows: number; hasMore: boolean } | undefined;
      facade.searchCombined$('blue-eyes', { type: 'Spell Card' }, 'en', 20, 0).subscribe((page) => (result = page));

      expect(indexService.sortIdsWithin).toHaveBeenCalledWith(entries, new Set());
      expect(result).toEqual({ cards: [], totalRows: 0, hasMore: false });
    });

    it('reorders hydrated cards to match the merged/sorted id order, regardless of API response order', () => {
      const entries: SearchIndexEntry[] = [];
      ygoApi.searchCards$.and.returnValue(of([]));
      indexService.loadIndex$.and.returnValue(of(entries));
      indexService.filterIndex.and.returnValue([10, 20]);
      indexService.sortIdsWithin.and.returnValue([10, 20]);
      ygoApi.getCardsByIds$.and.returnValue(of([card(20, 'B'), card(10, 'A')]));

      let result: { cards: YgoCard[] } | undefined;
      facade.searchCombined$('a', {}, 'en', 20, 0).subscribe((page) => (result = page));

      expect(result?.cards).toEqual([card(10, 'A'), card(20, 'B')]);
    });

    it('skips the live name search entirely for an empty query', () => {
      const entries: SearchIndexEntry[] = [];
      indexService.loadIndex$.and.returnValue(of(entries));
      indexService.filterIndex.and.returnValue([2]);
      indexService.sortIdsWithin.and.returnValue([2]);
      ygoApi.getCardsByIds$.and.returnValue(of([card(2, 'Effect Veiler')]));

      let result: { cards: YgoCard[] } | undefined;
      facade.searchCombined$('', { type: 'Effect Monster' }, 'en', 20, 0).subscribe((page) => (result = page));

      expect(ygoApi.searchCards$).not.toHaveBeenCalled();
      expect(result?.cards.map((c) => c.id)).toEqual([2]);
    });
  });

  describe('searchByName$', () => {
    it('searches by name only via the live API (IT/EN-aware), applying active filters client-side', () => {
      ygoApi.searchCards$.and.returnValue(
        of([
          { ...card(1, 'Blue-Eyes White Dragon'), type: 'Normal Monster' },
          { ...card(2, 'Blue-Eyes Toon Dragon'), type: 'Effect Monster' },
        ]),
      );

      let result: { cards: YgoCard[]; totalRows: number; hasMore: boolean } | undefined;
      facade.searchByName$('blue-eyes', { type: 'Normal Monster' }, 'it', 20, 0).subscribe((page) => (result = page));

      expect(ygoApi.searchCards$).toHaveBeenCalledWith('blue-eyes', 'it');
      expect(indexService.loadIndex$).not.toHaveBeenCalled();
      expect(result?.cards.map((c) => c.id)).toEqual([1]);
      expect(result?.totalRows).toBe(1);
    });

    it('sorts results by name and paginates without touching the local index', () => {
      ygoApi.searchCards$.and.returnValue(of([card(2, 'Bravo'), card(1, 'Alpha'), card(3, 'Charlie')]));

      let result: { cards: YgoCard[]; totalRows: number; hasMore: boolean } | undefined;
      facade.searchByName$('a', {}, 'en', 2, 0).subscribe((page) => (result = page));

      expect(result?.cards.map((c) => c.id)).toEqual([1, 2]);
      expect(result?.totalRows).toBe(3);
      expect(result?.hasMore).toBeTrue();
    });

    it('yields an empty page for an empty query without calling the live API', () => {
      let result: { cards: YgoCard[]; totalRows: number; hasMore: boolean } | undefined;
      facade.searchByName$('', {}, 'en', 20, 0).subscribe((page) => (result = page));

      expect(ygoApi.searchCards$).not.toHaveBeenCalled();
      expect(result).toEqual({ cards: [], totalRows: 0, hasMore: false });
    });
  });
});
