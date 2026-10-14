import { TestBed } from '@angular/core/testing';
import { CardBookmarksStore, DEFAULT_BOOKMARK_LIST_ID } from './card-bookmarks.store';

const card = (id: number) => ({ id, name: `card${id}`, type: 'Effect Monster', imageUrlSmall: null });

describe('CardBookmarksStore', () => {
  let store: CardBookmarksStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    store = TestBed.inject(CardBookmarksStore);
  });

  it('starts with one default list', () => {
    expect(store.lists().length).toBe(1);
    expect(store.activeListId()).toBe(DEFAULT_BOOKMARK_LIST_ID);
  });

  it('toggles a card on and off the active list', () => {
    expect(store.toggle(card(1))).toBeTrue();
    expect(store.isBookmarked(1)).toBeTrue();
    expect(store.toggle(card(1))).toBeFalse();
    expect(store.isBookmarked(1)).toBeFalse();
  });

  it('keeps lists separate and tracks all bookmarked ids', () => {
    const id = store.createList('Staple HAT')!;
    store.toggle(card(2), id);
    store.toggle(card(3), DEFAULT_BOOKMARK_LIST_ID);
    expect(store.isBookmarked(2, id)).toBeTrue();
    expect(store.isBookmarked(2, DEFAULT_BOOKMARK_LIST_ID)).toBeFalse();
    expect([...store.bookmarkedIds()].sort()).toEqual([2, 3]);
  });

  it('creates, renames and deletes lists but never the default one', () => {
    expect(store.createList('   ')).toBeNull();
    const id = store.createList('Side')!;
    expect(store.activeListId()).toBe(id);
    store.renameList(id, 'Side deck');
    expect(store.lists().find((l) => l.id === id)?.name).toBe('Side deck');
    store.deleteList(id);
    expect(store.lists().length).toBe(1);
    expect(store.activeListId()).toBe(DEFAULT_BOOKMARK_LIST_ID);
    store.deleteList(DEFAULT_BOOKMARK_LIST_ID);
    expect(store.lists().length).toBe(1);
  });

  it('persists across instances', () => {
    store.toggle(card(7));
    TestBed.resetTestingModule();
    const again = TestBed.inject(CardBookmarksStore);
    expect(again.isBookmarked(7)).toBeTrue();
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('ygo-checker-card-bookmarks', '{not json');
    TestBed.resetTestingModule();
    expect(TestBed.inject(CardBookmarksStore).lists().length).toBe(1);
  });
});
