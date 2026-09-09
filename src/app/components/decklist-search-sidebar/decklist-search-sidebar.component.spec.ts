import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { DecklistSearchSidebarComponent } from './decklist-search-sidebar.component';
import { I18nService } from '../../services/i18n.service';
import { CardSearchFacade, CardSearchPage } from '../../services/card-search.facade';
import { FormatStore } from '../../core/stores/format.store';
import { YgoCard } from '../../models/ygo-card.model';

describe('Decklist search continuity', () => {
  const card: YgoCard = { id: 1, name: 'Card', type: 'Effect Monster', desc: 'Effect', card_images: [] };
  function setup(searchPage$: jasmine.Spy) {
    TestBed.configureTestingModule({ imports: [DecklistSearchSidebarComponent], providers: [
      { provide: I18nService, useValue: { lang: signal('it'), lang$: new BehaviorSubject('it'), t: (key: string) => key } },
      { provide: CardSearchFacade, useValue: { searchPage$ } },
      { provide: FormatStore, useValue: { formatId$: of('edison'), selectedFormat: () => null } },
    ] });
    TestBed.overrideComponent(DecklistSearchSidebarComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(DecklistSearchSidebarComponent);
    fixture.componentRef.setInput('deckCards', []);
    return fixture;
  }

  it('cancels old results immediately when a different query is typed', fakeAsync(() => {
    const first = new Subject<CardSearchPage>();
    const second = new Subject<CardSearchPage>();
    const search = jasmine.createSpy('search').and.returnValues(first, second);
    const fixture = setup(search);
    fixture.componentInstance.onSearchInput('first');
    tick(280);
    fixture.componentInstance.onSearchInput('second');
    first.next({ cards: [card], totalRows: 1, hasMore: false });
    expect(fixture.componentInstance.searchResults()).toEqual([]);
    tick(280);
    second.next({ cards: [{ ...card, id: 2 }], totalRows: 1, hasMore: false });
    expect(fixture.componentInstance.searchResults()[0].id).toBe(2);
  }));

  it('does not append an old load-more page to a new query', fakeAsync(() => {
    const more = new Subject<CardSearchPage>();
    const search = jasmine.createSpy('search').and.returnValues(of({ cards: [card], totalRows: 2, hasMore: true }), more, of({ cards: [], totalRows: 0, hasMore: false }));
    const fixture = setup(search);
    fixture.componentInstance.onSearchInput('first');
    tick(280);
    fixture.componentInstance.loadMore();
    fixture.componentInstance.onSearchInput('second');
    more.next({ cards: [{ ...card, id: 3 }], totalRows: 2, hasMore: false });
    tick(280);
    expect(fixture.componentInstance.searchResults()).toEqual([]);
  }));

  it('counts copies across Main and Side before enabling quick add', () => {
    const fixture = setup(jasmine.createSpy('search'));
    fixture.componentRef.setInput('deckCards', [
      { id: 1, name: 'Card', type: 'Effect Monster', quantity: 2, section: 'main', imageUrlSmall: null },
      { id: 1, name: 'Card', type: 'Effect Monster', quantity: 1, section: 'side', imageUrlSmall: null },
    ]);
    fixture.componentInstance.searchResults.set([card]);
    expect(fixture.componentInstance.enrichedSearchRows()[0].qtyInDeck).toBe(3);
    expect(fixture.componentInstance.enrichedSearchRows()[0].canAdd).toBeFalse();
  });
});
