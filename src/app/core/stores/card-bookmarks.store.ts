import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'ygo-checker-card-bookmarks';
export const DEFAULT_BOOKMARK_LIST_ID = 'default';
const MAX_LIST_NAME = 40;

export interface BookmarkedCard {
  id: number;
  name: string;
  type: string;
  imageUrlSmall: string | null;
}

export interface BookmarkList {
  id: string;
  name: string;
  cards: BookmarkedCard[];
}

interface BookmarkStorage {
  lists: BookmarkList[];
  activeListId: string;
}

function emptyStorage(defaultName: string): BookmarkStorage {
  return { lists: [{ id: DEFAULT_BOOKMARK_LIST_ID, name: defaultName, cards: [] }], activeListId: DEFAULT_BOOKMARK_LIST_ID };
}

/** Named lists of bookmarked cards, kept in this browser (like the saved decks). */
@Injectable({ providedIn: 'root' })
export class CardBookmarksStore {
  private readonly state = signal<BookmarkStorage>(this.read());

  readonly lists = computed(() => this.state().lists);
  readonly activeListId = computed(() => this.state().activeListId);
  readonly activeList = computed(
    () => this.state().lists.find((list) => list.id === this.state().activeListId) ?? this.state().lists[0],
  );
  /** Every bookmarked card id across all lists. */
  readonly bookmarkedIds = computed(() => new Set(this.state().lists.flatMap((list) => list.cards.map((c) => c.id))));

  isBookmarked(cardId: number, listId?: string): boolean {
    const lists = listId ? this.state().lists.filter((l) => l.id === listId) : this.state().lists;
    return lists.some((list) => list.cards.some((card) => card.id === cardId));
  }

  /** Adds the card to the list (active one by default), or removes it when already there. Returns true if added. */
  toggle(card: BookmarkedCard, listId: string = this.state().activeListId): boolean {
    let added = false;
    this.update((s) => ({
      ...s,
      lists: s.lists.map((list) => {
        if (list.id !== listId) return list;
        if (list.cards.some((c) => c.id === card.id)) {
          return { ...list, cards: list.cards.filter((c) => c.id !== card.id) };
        }
        added = true;
        return { ...list, cards: [{ id: card.id, name: card.name, type: card.type, imageUrlSmall: card.imageUrlSmall }, ...list.cards] };
      }),
    }));
    return added;
  }

  remove(cardId: number, listId: string = this.state().activeListId): void {
    this.update((s) => ({
      ...s,
      lists: s.lists.map((list) => (list.id === listId ? { ...list, cards: list.cards.filter((c) => c.id !== cardId) } : list)),
    }));
  }

  setActiveList(listId: string): void {
    if (!this.state().lists.some((list) => list.id === listId)) return;
    this.update((s) => ({ ...s, activeListId: listId }));
  }

  /** Creates a list and makes it active. Returns its id, or null for an empty name. */
  createList(name: string): string | null {
    const clean = name.trim().slice(0, MAX_LIST_NAME);
    if (!clean) return null;
    const id = `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.update((s) => ({ lists: [...s.lists, { id, name: clean, cards: [] }], activeListId: id }));
    return id;
  }

  renameList(listId: string, name: string): void {
    const clean = name.trim().slice(0, MAX_LIST_NAME);
    if (!clean) return;
    this.update((s) => ({ ...s, lists: s.lists.map((list) => (list.id === listId ? { ...list, name: clean } : list)) }));
  }

  /** The default list can be emptied but never deleted. */
  deleteList(listId: string): void {
    if (listId === DEFAULT_BOOKMARK_LIST_ID) return;
    this.update((s) => {
      const lists = s.lists.filter((list) => list.id !== listId);
      return { lists, activeListId: s.activeListId === listId ? DEFAULT_BOOKMARK_LIST_ID : s.activeListId };
    });
  }

  private update(mutate: (state: BookmarkStorage) => BookmarkStorage): void {
    this.state.update(mutate);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      // private mode: bookmarks just aren't persisted
    }
  }

  private read(): BookmarkStorage {
    const fallback = emptyStorage('Preferiti');
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<BookmarkStorage>;
      const lists = Array.isArray(parsed.lists) ? parsed.lists.filter((l) => l && typeof l.id === 'string' && Array.isArray(l.cards)) : [];
      if (!lists.some((l) => l.id === DEFAULT_BOOKMARK_LIST_ID)) lists.unshift(fallback.lists[0]);
      const activeListId = lists.some((l) => l.id === parsed.activeListId) ? (parsed.activeListId as string) : DEFAULT_BOOKMARK_LIST_ID;
      return { lists, activeListId };
    } catch {
      return fallback;
    }
  }
}
