import { Injectable } from '@angular/core';
import { supabase } from '../core/supabase-client';
import { Decklist, DecklistStorage } from '../models/decklist.model';
import { AuthService } from './auth.service';

const ACTIVE_ID_KEY = 'ygo-checker-active-decklist-id';
const SAVE_DEBOUNCE_MS = 800;

interface DeckRow {
  id: string;
  name: string;
  cards: Decklist['cards'];
  updated_at: string;
}

function rowToDecklist(row: DeckRow): Decklist {
  return { id: row.id, name: row.name, updatedAt: row.updated_at, cards: row.cards };
}

/**
 * Same load()/save() shape as DecklistService so DecklistStore can swap the backing
 * store without touching its own edit logic — see DeckRow mapping for the Postgres
 * side (table `decks`, RLS-scoped to auth.uid()).
 */
@Injectable({ providedIn: 'root' })
export class DeckSyncService {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStorage: DecklistStorage | null = null;
  private pendingResolvers: Array<() => void> = [];

  constructor(private readonly authService: AuthService) {}

  async load(): Promise<DecklistStorage> {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      return { activeId: null, decklists: [] };
    }

    const { data, error } = await supabase
      .from('decks')
      .select('id, name, cards, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to load decks from Supabase');
    }

    const decklists = data.map(rowToDecklist);
    const storedActiveId = localStorage.getItem(ACTIVE_ID_KEY);
    const activeId = decklists.some((d) => d.id === storedActiveId)
      ? storedActiveId
      : (decklists[0]?.id ?? null);

    return { activeId, decklists };
  }

  /**
   * Debounced: DecklistStore.persist() fires on every single edit (add/remove/move
   * one copy), so writing to Postgres synchronously on each call would mean one
   * network round-trip per click. Coalesces rapid edits into one write.
   */
  save(storage: DecklistStorage): Promise<void> {
    if (storage.activeId) {
      localStorage.setItem(ACTIVE_ID_KEY, storage.activeId);
    }

    this.pendingStorage = storage;
    return new Promise((resolve) => {
      this.pendingResolvers.push(resolve);
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
      }
      this.saveTimer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
    });
  }

  /** Forces an immediate write of whatever is currently pending — call before navigating away. */
  async flushNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.flush();
  }

  private async flush(): Promise<void> {
    const storage = this.pendingStorage;
    const resolvers = this.pendingResolvers;
    this.pendingStorage = null;
    this.pendingResolvers = [];
    this.saveTimer = null;

    if (!storage) {
      resolvers.forEach((resolve) => resolve());
      return;
    }

    const userId = this.authService.currentUser?.id;
    if (!userId) {
      resolvers.forEach((resolve) => resolve());
      return;
    }

    try {
      const ids = storage.decklists.map((d) => d.id);
      if (storage.decklists.length > 0) {
        const rows = storage.decklists.map((deck) => ({
          id: deck.id,
          user_id: userId,
          name: deck.name,
          cards: deck.cards,
          updated_at: deck.updatedAt,
        }));
        const { error: upsertError } = await supabase.from('decks').upsert(rows, { onConflict: 'id' });
        if (upsertError) {
          throw new Error(upsertError.message);
        }
      }

      // Remove remote decks the user deleted locally (or all, if the list is now empty).
      // .not('id', 'in', array) lets supabase-js format the list — safer than building
      // the PostgREST "(a,b,c)" string by hand.
      let deleteQuery = supabase.from('decks').delete().eq('user_id', userId);
      if (ids.length > 0) {
        deleteQuery = deleteQuery.not('id', 'in', ids);
      }
      const { error: deleteError } = await deleteQuery;
      if (deleteError) {
        throw new Error(deleteError.message);
      }
    } finally {
      resolvers.forEach((resolve) => resolve());
    }
  }

  /** One-time import of localStorage decks into a freshly-logged-in, empty Supabase account. */
  async importLocalDecks(storage: DecklistStorage): Promise<void> {
    if (storage.decklists.length === 0) {
      return;
    }
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      return;
    }
    const rows = storage.decklists.map((deck) => ({
      id: deck.id,
      user_id: userId,
      name: deck.name,
      cards: deck.cards,
      updated_at: deck.updatedAt,
    }));
    const { error } = await supabase.from('decks').upsert(rows, { onConflict: 'id' });
    if (error) {
      throw new Error(error.message);
    }
  }
}
