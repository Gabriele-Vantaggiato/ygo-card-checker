import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { DecklistSearchSidebarComponent } from './decklist-search-sidebar.component';
import { I18nService } from '../../services/i18n.service';
import { CardSearchFacade, CardSearchPage } from '../../services/card-search.facade';
import { FormatStore } from '../../core/stores/format.store';
import { YgoCard } from '../../models/ygo-card.model';
import { YgoFormat } from '../../models/ygo-format.model';

const card: YgoCard = { id: 1, name: 'Card', type: 'Effect Monster', desc: 'Effect', card_images: [] };
const hatFormat = { id: 'hat', name: 'HAT' } as unknown as YgoFormat;
const tcgFormat = { id: 'tcg', name: 'TCG' } as unknown as YgoFormat;

describe('Decklist search sidebar', () => {
  let searchCombined$: jasmine.Spy;
  let searchByName$: jasmine.Spy;
  let browseFormat$: jasmine.Spy;
  let selectedFormat$: BehaviorSubject<YgoFormat | null>;

  function setup() {
    searchCombined$ = jasmine.createSpy('searchCombined$').and.returnValue(of({ cards: [], totalRows: 0, hasMore: false }));
    searchByName$ = jasmine.createSpy('searchByName$').and.returnValue(of({ cards: [], totalRows: 0, hasMore: false }));
    browseFormat$ = jasmine.createSpy('browseFormat$').and.returnValue(of({ cards: [], totalRows: 0, hasMore: false }));
    selectedFormat$ = new BehaviorSubject<YgoFormat | null>(null);

    TestBed.configureTestingModule({ imports: [DecklistSearchSidebarComponent], providers: [
      { provide: I18nService, useValue: { lang: signal('it'), lang$: new BehaviorSubject('it'), t: (key: string) => key } },
      { provide: CardSearchFacade, useValue: { searchCombined$, searchByName$, browseFormat$, evaluateLegality$: () => of(new Map()) } },
      { provide: FormatStore, useValue: { formatId$: of('hat'), selectedFormat$, selectedFormat: () => selectedFormat$.value } },
    ] });
    TestBed.overrideComponent(DecklistSearchSidebarComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(DecklistSearchSidebarComponent);
    fixture.componentRef.setInput('deckCards', []);
    return fixture;
  }

  it('loads the default browse list for the resolved format on init', fakeAsync(() => {
    const fixture = setup();
    browseFormat$.and.returnValue(of({ cards: [card], totalRows: 1, hasMore: false }));

    selectedFormat$.next(hatFormat);
    tick(150);

    expect(browseFormat$).toHaveBeenCalledWith('hat', 'it', 50, 0);
    expect(searchCombined$).not.toHaveBeenCalled();
    expect(fixture.componentInstance.searchResults()).toEqual([card]);
  }));

  it('filters live by name only while typing (debounced 280ms)', fakeAsync(() => {
    const fixture = setup();
    selectedFormat$.next(hatFormat);
    tick(150);
    searchByName$.and.returnValue(of({ cards: [card], totalRows: 1, hasMore: false }));

    fixture.componentInstance.onSearchInput('dragon');
    tick(279);
    expect(searchByName$).not.toHaveBeenCalled();
    tick(1);

    expect(searchByName$).toHaveBeenCalledWith('dragon', {}, 'it', 50, 0);
    expect(searchCombined$).not.toHaveBeenCalled();
    expect(fixture.componentInstance.searchResults()).toEqual([card]);
  }));

  it('runs the combined search on submitSearch()', fakeAsync(() => {
    const fixture = setup();
    selectedFormat$.next(hatFormat);
    tick(150);
    searchCombined$.and.returnValue(of({ cards: [card], totalRows: 1, hasMore: false }));

    fixture.componentInstance.onSearchInput('dragon');
    fixture.componentInstance.submitSearch();
    tick(150);

    expect(searchCombined$).toHaveBeenCalledWith('dragon', {}, 'it', 50, 0);
    expect(fixture.componentInstance.searchResults()).toEqual([card]);
  }));

  it('runs the search immediately when a filter changes', fakeAsync(() => {
    const fixture = setup();
    selectedFormat$.next(hatFormat);
    tick(150);
    searchCombined$.and.returnValue(of({ cards: [card], totalRows: 1, hasMore: false }));

    fixture.componentInstance.setAdvancedFilters({ type: 'Effect Monster' });
    tick(150);

    expect(searchCombined$).toHaveBeenCalledWith('', { type: 'Effect Monster' }, 'it', 50, 0);
    expect(fixture.componentInstance.searchResults()).toEqual([card]);
  }));

  it('reloads the default list for the new format while idle', fakeAsync(() => {
    const fixture = setup();
    selectedFormat$.next(hatFormat);
    tick(150);
    browseFormat$.calls.reset();

    selectedFormat$.next(tcgFormat);
    tick(150);

    expect(browseFormat$).toHaveBeenCalledWith('tcg', 'it', 50, 0);
    void fixture;
  }));

  it('cancels old results immediately when a new search is submitted', fakeAsync(() => {
    const fixture = setup();
    selectedFormat$.next(hatFormat);
    tick(150);

    const first = new Subject<CardSearchPage>();
    const second = new Subject<CardSearchPage>();
    searchCombined$.and.returnValues(first, second);

    fixture.componentInstance.onSearchInput('first');
    fixture.componentInstance.submitSearch();
    tick(150);
    fixture.componentInstance.onSearchInput('second');
    fixture.componentInstance.submitSearch();
    first.next({ cards: [card], totalRows: 1, hasMore: false });
    expect(fixture.componentInstance.searchResults()).toEqual([]);
    tick(150);
    second.next({ cards: [{ ...card, id: 2 }], totalRows: 1, hasMore: false });
    expect(fixture.componentInstance.searchResults()[0].id).toBe(2);
  }));

  it('does not append an old load-more page to a new search', fakeAsync(() => {
    const fixture = setup();
    selectedFormat$.next(hatFormat);
    tick(150);

    const more = new Subject<CardSearchPage>();
    searchCombined$.and.returnValues(
      of({ cards: [card], totalRows: 2, hasMore: true }),
      more,
      of({ cards: [], totalRows: 0, hasMore: false }),
    );
    fixture.componentInstance.onSearchInput('first');
    fixture.componentInstance.submitSearch();
    tick(150);
    fixture.componentInstance.loadMore();
    fixture.componentInstance.onSearchInput('second');
    fixture.componentInstance.submitSearch();
    more.next({ cards: [{ ...card, id: 3 }], totalRows: 2, hasMore: false });
    tick(150);
    expect(fixture.componentInstance.searchResults()).toEqual([]);
  }));

  it('counts copies across Main and Side before enabling quick add', () => {
    const fixture = setup();
    fixture.componentRef.setInput('deckCards', [
      { id: 1, name: 'Card', type: 'Effect Monster', quantity: 2, section: 'main', imageUrlSmall: null },
      { id: 1, name: 'Card', type: 'Effect Monster', quantity: 1, section: 'side', imageUrlSmall: null },
    ]);
    fixture.componentInstance.searchResults.set([card]);
    expect(fixture.componentInstance.enrichedSearchRows()[0].qtyInDeck).toBe(3);
    expect(fixture.componentInstance.enrichedSearchRows()[0].canAdd).toBeFalse();
  });
});
