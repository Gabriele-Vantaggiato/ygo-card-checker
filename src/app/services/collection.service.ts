import { Injectable, inject, signal } from '@angular/core';
import { supabase } from '../core/supabase-client';
import { CardCondition, CardLanguage, CollectionDraft, CollectionItem } from '../models/collection.model';
import { applyItemPatch, collectionKey, CollectionItemPatch } from '../utils/collection.utils';
import { AuthService } from './auth.service';
import { CollectionCacheService } from './collection-cache.service';

const TABLE = 'collection_items';
const PAGE_SIZE = 1000;
const CONFLICT_COLUMNS = 'user_id,set_code,rarity,language,condition,first_edition';

export type CollectionStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';

class StaleUserError extends Error {
  constructor() {
    super('User changed during collection operation');
  }
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && /failed to fetch|network|load failed/i.test(message);
}

interface CollectionRow {
  id: string;
  user_id: string;
  passcode: number;
  card_name: string;
  set_code: string;
  rarity: string;
  language: string;
  condition: string;
  first_edition: boolean;
  quantity: number;
  notes: string | null;
  updated_at: string;
}

function rowToItem(row: CollectionRow): CollectionItem {
  return {
    id: row.id,
    passcode: row.passcode,
    cardName: row.card_name,
    setCode: row.set_code,
    rarity: row.rarity,
    language: row.language as CardLanguage,
    condition: row.condition as CardCondition,
    firstEdition: row.first_edition,
    quantity: row.quantity,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

function itemToRow(item: CollectionItem, userId: string): CollectionRow {
  return {
    id: item.id,
    user_id: userId,
    passcode: item.passcode,
    card_name: item.cardName,
    set_code: item.setCode,
    rarity: item.rarity,
    language: item.language,
    condition: item.condition,
    first_edition: item.firstEdition,
    quantity: item.quantity,
    notes: item.notes,
    updated_at: item.updatedAt,
  };
}

/**
 * The player's physical cards. Reads come from the IndexedDB snapshot first, then
 * Supabase; writes are applied locally at once and flushed to Supabase, with ids
 * of unsynced upserts/deletes kept in `pending`/`deleted` so offline edits survive.
 * load/write/flush operations are serialized through a promise chain.
 */
@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly auth = inject(AuthService);
  private readonly cache = inject(CollectionCacheService);

  readonly items = signal<CollectionItem[]>([]);
  readonly status = signal<CollectionStatus>('idle');

  private pending = new Set<string>();
  private deleted = new Set<string>();
  /** User whose data currently lives in items/pending/deleted. */
  private stateOwner: string | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  ownedQuantity(passcode: number): number {
    return this.items().reduce((sum, item) => (item.passcode === passcode ? sum + item.quantity : sum), 0);
  }

  load(): Promise<void> {
    return this.enqueue(() => this.doLoad());
  }

  async addMany(drafts: readonly CollectionDraft[]): Promise<void> {
    await this.write(async (userId) => {
      const now = new Date().toISOString();
      let next = [...this.items()];
      for (const draft of drafts) {
        const index = next.findIndex((item) => collectionKey(item) === collectionKey(draft));
        if (index >= 0) {
          next[index] = { ...next[index], quantity: next[index].quantity + draft.quantity, updatedAt: now };
          this.pending.add(next[index].id);
        } else {
          const created: CollectionItem = { ...draft, id: crypto.randomUUID(), updatedAt: now };
          next = [created, ...next];
          this.pending.add(created.id);
        }
      }
      await this.commit(userId, next);
    });
  }

  async update(id: string, patch: CollectionItemPatch): Promise<void> {
    await this.write(async (userId) => {
      const result = applyItemPatch(this.items(), id, patch, new Date().toISOString());
      if (!result) {
        return;
      }
      this.pending.add(result.touchedId);
      if (result.removedId) {
        this.pending.delete(result.removedId);
        this.deleted.add(result.removedId);
      }
      await this.commit(userId, result.items);
    });
  }

  async remove(id: string): Promise<void> {
    await this.write(async (userId) => {
      this.pending.delete(id);
      this.deleted.add(id);
      await this.commit(userId, this.items().filter((item) => item.id !== id));
    });
  }

  /** Runs a write for the current user; never leaks the internal stale-user error. */
  private async write(task: (userId: string) => Promise<void>): Promise<void> {
    const userId = this.requireUser();
    try {
      await this.enqueue(async () => {
        this.assertUser(userId);
        if (this.stateOwner !== userId) {
          // In-memory state belongs to someone else: drop it and load this user's own.
          this.resetState();
          await this.doLoad();
          this.assertUser(userId);
          if (this.stateOwner !== userId) {
            throw new StaleUserError();
          }
        }
        await task(userId);
      });
    } catch (err) {
      if (err instanceof StaleUserError) {
        throw new Error('Accedi per modificare la collezione');
      }
      throw err;
    }
  }

  private resetState(): void {
    this.items.set([]);
    this.pending = new Set();
    this.deleted = new Set();
    this.stateOwner = null;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task);
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async doLoad(): Promise<void> {
    const userId = this.userId();
    if (!userId) {
      this.resetState();
      this.status.set('idle');
      return;
    }
    if (this.stateOwner !== userId) {
      this.resetState();
    }
    this.status.set('loading');
    const [cached, pending, deleted] = await Promise.all([
      this.cache.get<CollectionItem[]>(this.key(userId, 'items')),
      this.cache.get<string[]>(this.key(userId, 'pending')),
      this.cache.get<string[]>(this.key(userId, 'deleted')),
    ]);
    if (this.isStale(userId)) {
      this.status.set('idle');
      return;
    }
    this.stateOwner = userId;
    this.items.set(cached ?? []);
    this.pending = new Set(pending ?? []);
    this.deleted = new Set(deleted ?? []);

    try {
      await this.flush(userId);
      const remote = await this.fetchAll(userId);
      if (this.isStale(userId)) {
        this.status.set('idle');
        return;
      }
      // Re-apply local edits that are still unsynced so they are not lost.
      this.items.set(this.applyLocalChanges(remote));
      await this.cache.set(this.key(userId, 'items'), this.items());
      if (this.isStale(userId)) {
        this.status.set('idle');
        return;
      }
      this.status.set('ready');
    } catch (err) {
      if (err instanceof StaleUserError || this.isStale(userId)) {
        this.status.set('idle');
        return;
      }
      console.error('[collection]', err);
      // Cached items stay visible in both cases.
      this.status.set(isNetworkError(err) ? 'offline' : 'error');
    }
  }

  private async fetchAll(userId: string): Promise<CollectionItem[]> {
    const rows: CollectionRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data) {
        throw error ?? new Error('Failed to load collection');
      }
      this.assertUser(userId);
      rows.push(...(data as CollectionRow[]));
      if (data.length < PAGE_SIZE) {
        return rows.map(rowToItem);
      }
    }
  }

  private applyLocalChanges(remote: CollectionItem[]): CollectionItem[] {
    const local = new Map(this.items().map((item) => [item.id, item]));
    const merged = remote
      .filter((item) => !this.deleted.has(item.id))
      .map((item) => (this.pending.has(item.id) ? (local.get(item.id) ?? item) : item));
    const known = new Set(merged.map((item) => item.id));
    const added = [...this.pending]
      .filter((id) => !known.has(id) && !this.deleted.has(id) && local.has(id))
      .map((id) => local.get(id) as CollectionItem);
    return [...added, ...merged];
  }

  private async commit(userId: string, next: CollectionItem[]): Promise<void> {
    this.items.set(next);
    await this.persistLocal(userId);
    if (this.isStale(userId)) {
      return;
    }
    try {
      await this.flush(userId);
      this.status.set('ready');
    } catch (err) {
      if (err instanceof StaleUserError || this.isStale(userId)) {
        return;
      }
      console.error('[collection]', err);
      this.status.set(isNetworkError(err) ? 'offline' : 'error');
    }
  }

  private async persistLocal(userId: string): Promise<void> {
    // Arguments are evaluated synchronously, so the snapshot belongs to `userId`.
    await Promise.all([
      this.cache.set(this.key(userId, 'items'), this.items()),
      this.cache.set(this.key(userId, 'pending'), [...this.pending]),
      this.cache.set(this.key(userId, 'deleted'), [...this.deleted]),
    ]);
  }

  /**
   * Pushes unsynced deletes and upserts; throws if Supabase is unreachable.
   * Only ids snapshotted before each await are cleared afterwards.
   * Single-device assumption: upsert conflicts are resolved on the natural key, not on id.
   */
  private async flush(userId: string): Promise<void> {
    const deleteIds = [...this.deleted];
    if (deleteIds.length > 0) {
      const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).in('id', deleteIds);
      if (error) {
        throw error;
      }
      this.assertUser(userId);
      deleteIds.forEach((id) => this.deleted.delete(id));
    }
    const snapshot = this.items().filter((item) => this.pending.has(item.id));
    if (snapshot.length > 0) {
      const rows = snapshot.map((item) => itemToRow(item, userId));
      const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: CONFLICT_COLUMNS });
      if (error) {
        throw error;
      }
      this.assertUser(userId);
      const current = new Map(this.items().map((item) => [item.id, item]));
      for (const item of snapshot) {
        // Items are replaced immutably: a different reference means it was edited meanwhile.
        if (current.get(item.id) === item) {
          this.pending.delete(item.id);
        }
      }
    }
    // Pending ids whose item no longer exists have nothing to push.
    const existing = new Set(this.items().map((item) => item.id));
    for (const id of [...this.pending]) {
      if (!existing.has(id)) {
        this.pending.delete(id);
      }
    }
    await this.persistLocal(userId);
  }

  private requireUser(): string {
    const userId = this.userId();
    if (!userId) {
      throw new Error('Accedi per modificare la collezione');
    }
    return userId;
  }

  private isStale(userId: string): boolean {
    return this.userId() !== userId;
  }

  private assertUser(userId: string): void {
    if (this.isStale(userId)) {
      throw new StaleUserError();
    }
  }

  private userId(): string | null {
    return this.auth.currentUser?.id ?? null;
  }

  private key(userId: string, name: 'items' | 'pending' | 'deleted'): string {
    return `${userId}:${name}`;
  }
}
