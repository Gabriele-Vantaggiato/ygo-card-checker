import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { CheckerStore } from './checker.store';
import { FormatStore } from '../../../core/stores/format.store';
import { YgoApiService } from '../../../services/ygo-api.service';
import { CardLegalityFacade } from '../../../services/card-legality.facade';
import { CardKnowledgeService } from '../../../services/card-knowledge.service';
import { CardSearchFacade } from '../../../services/card-search.facade';
import { I18nService } from '../../../services/i18n.service';
import { YgoCard } from '../../../models/ygo-card.model';
import { YgoFormat } from '../../../models/ygo-format.model';

const card: YgoCard = { id: 1, name: 'Card', type: 'Effect Monster', desc: 'Effect', card_images: [] };
const hatFormat = { id: 'hat', name: 'HAT' } as unknown as YgoFormat;
const tcgFormat = { id: 'tcg', name: 'TCG' } as unknown as YgoFormat;

describe('CheckerStore search', () => {
  let searchCombined$: jasmine.Spy;
  let searchByName$: jasmine.Spy;
  let browseFormat$: jasmine.Spy;
  let selectedFormat$: BehaviorSubject<YgoFormat | null>;

  function setup(): CheckerStore {
    spyOn(Storage.prototype, 'getItem').and.returnValue(null);
    spyOn(Storage.prototype, 'setItem');

    searchCombined$ = jasmine.createSpy('searchCombined$').and.returnValue(of({ cards: [], totalRows: 0, hasMore: false }));
    searchByName$ = jasmine.createSpy('searchByName$').and.returnValue(of({ cards: [], totalRows: 0, hasMore: false }));
    browseFormat$ = jasmine.createSpy('browseFormat$').and.returnValue(of({ cards: [], totalRows: 0, hasMore: false }));
    selectedFormat$ = new BehaviorSubject<YgoFormat | null>(null);

    TestBed.configureTestingModule({
      providers: [
        CheckerStore,
        {
          provide: FormatStore,
          useValue: {
            formats: signal([]),
            formatId: signal('hat'),
            formatId$: of('hat'),
            formats$: of([]),
            selectedFormat$,
            selectedFormat: () => selectedFormat$.value,
          },
        },
        { provide: YgoApiService, useValue: { searchCards$: jasmine.createSpy(), getCardById$: () => of(null) } },
        { provide: CardLegalityFacade, useValue: { evaluateMany$: () => of(new Map()), evaluate$: () => of(null) } },
        {
          provide: CardKnowledgeService,
          useValue: {
            findRelated$: () =>
              of({ tags: [], displayTags: [], series: [], mentions: [], effects: [], suggestions: [], groups: [], available: false }),
          },
        },
        { provide: CardSearchFacade, useValue: { searchCombined$, searchByName$, browseFormat$ } },
        { provide: I18nService, useValue: { lang: signal('it'), lang$: new BehaviorSubject('it'), t: (key: string) => key } },
      ],
    });
    return TestBed.inject(CheckerStore);
  }

  it('loads the default browse list for the resolved format on init', fakeAsync(() => {
    const store = setup();
    browseFormat$.and.returnValue(of({ cards: [card], totalRows: 1, hasMore: false }));

    selectedFormat$.next(hatFormat);
    tick(150);

    expect(browseFormat$).toHaveBeenCalledWith('hat', 'it', 50, 0);
    expect(searchCombined$).not.toHaveBeenCalled();
    expect(store.suggestions()).toEqual([card]);
  }));

  it('filters live by name only while typing (debounced 280ms), not the combined search', fakeAsync(() => {
    const store = setup();
    selectedFormat$.next(hatFormat);
    tick(150);
    searchByName$.and.returnValue(of({ cards: [card], totalRows: 1, hasMore: false }));

    store.setSearchQuery('dragon');
    tick(279);
    expect(searchByName$).not.toHaveBeenCalled();
    tick(1);

    expect(searchByName$).toHaveBeenCalledWith('dragon', {}, 'it', 50, 0);
    expect(searchCombined$).not.toHaveBeenCalled();
    expect(store.suggestions()).toEqual([card]);
  }));

  it('runs the combined name+effect search on submitSearch(), superseding a pending live search', fakeAsync(() => {
    const store = setup();
    selectedFormat$.next(hatFormat);
    tick(150);
    searchCombined$.and.returnValue(of({ cards: [card], totalRows: 1, hasMore: false }));

    store.setSearchQuery('dragon');
    store.submitSearch();
    tick(300);

    expect(searchCombined$).toHaveBeenCalledWith('dragon', {}, 'it', 50, 0);
    expect(searchByName$).not.toHaveBeenCalled();
    expect(store.suggestions()).toEqual([card]);
  }));

  it('runs the combined search immediately when a filter changes, even with an empty query', fakeAsync(() => {
    const store = setup();
    selectedFormat$.next(hatFormat);
    tick(150);
    searchCombined$.and.returnValue(of({ cards: [card], totalRows: 1, hasMore: false }));

    store.setAdvancedFilters({ type: 'Effect Monster' });
    tick(150);

    expect(searchCombined$).toHaveBeenCalledWith('', { type: 'Effect Monster' }, 'it', 50, 0);
    expect(store.suggestions()).toEqual([card]);
  }));

  it('reloads the default browse list for the new format while idle', fakeAsync(() => {
    const store = setup();
    selectedFormat$.next(hatFormat);
    tick(150);
    browseFormat$.calls.reset();

    selectedFormat$.next(tcgFormat);
    tick(150);

    expect(browseFormat$).toHaveBeenCalledWith('tcg', 'it', 50, 0);
    void store;
  }));

  it('does not reload the default list on format change while a query or filter is active', fakeAsync(() => {
    const store = setup();
    selectedFormat$.next(hatFormat);
    tick(150);
    store.setAdvancedFilters({ type: 'Effect Monster' });
    tick(150);
    browseFormat$.calls.reset();
    searchCombined$.calls.reset();

    selectedFormat$.next(tcgFormat);
    tick(150);

    expect(browseFormat$).not.toHaveBeenCalled();
  }));
});
