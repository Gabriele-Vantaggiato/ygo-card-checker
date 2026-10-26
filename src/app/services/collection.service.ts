import { Injectable, inject, signal } from '@angular/core';
import { supabase } from '../core/supabase-client';
import { CardCondition, CardLanguage, CollectionDraft, CollectionItem } from '../models/collection.model';
import { applyItemPatch, collectionKey, CollectionItemPatch } from '../utils/collection.utils';
import { AuthService } from './auth.service';
import { CollectionCacheService } from './collection-cache.service';

const TABLE = 'collection_items';
const CONFLICT_COLUMNS = 'user_id,set_code,rarity,language,condition,first_edition';

export type CollectionStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';

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
 */
@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly auth = inject(AuthService);
  private readonly cache = inject(CollectionCacheService);

  readonly items = signal<CollectionItem[]>([]);
  readonly status = signal<CollectionStatus>('idle');

  private pending = new Set<string>();
  private deleted = new Set<string>();

  ownedQuantity(passcode: number): number {
    return this.items().reduce((sum, item) => (item.passcode === passcode ? sum + item.quantity : sum), 0);
  }

  async load(): Promise<void> {
    const userId = this.userId();
    if (!userId) {
      this.items.set([]);
      this.status.set('idle');
      return;
    }
    this.status.set('loading');
    const [cached, pending, deleted] = await Promise.all([
      this.cache.get<CollectionItem[]>(this.key(userId, 'items')),
      this.cache.get<string[]>(this.key(userId, 'pending')),
      this.cache.get<string[]>(this.key(userId, 'deleted')),
    ]);
    this.items.set(cached ?? []);
    this.pending = new Set(pending ?? []);
    this.deleted = new Set(deleted ?? []);

    try {
      await this.flush(userId);
      const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).order('updated_at', { ascending: false });
      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to load collection');
      }
      this.items.set((data as CollectionRow[]).map(rowToItem));
      await this.cache.set(this.key(userId, 'items'), this.items());
      this.status.set('ready');
    } catch {
      this.status.set(cached ? 'offline' : 'error');
    }
  }

  async addMany(drafts: readonly CollectionDraft[]): Promise<void> {
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
    await this.commit(next);
  }

  async update(id: string, patch: CollectionItemPatch): Promise<void> {
    const result = applyItemPatch(this.items(), id, patch, new Date().toISOString());
    if (!result) {
      return;
    }
    this.pending.add(result.touchedId);
    if (result.removedId) {
      this.pending.delete(result.removedId);
      this.deleted.add(result.removedId);
    }
    await this.commit(result.items);
  }

  async remove(id: string): Promise<void> {
    this.pending.delete(id);
    this.deleted.add(id);
    await this.commit(this.items().filter((item) => item.id !== id));
  }

  private async commit(next: CollectionItem[]): Promise<void> {
    this.items.set(next);
    const userId = this.userId();
    if (!userId) {
      return;
    }
    await this.persistLocal(userId);
    try {
      await this.flush(userId);
      this.status.set('ready');
    } catch {
      this.status.set('offline');
    }
  }

  private async persistLocal(userId: string): Promise<void> {
    await Promise.all([
      this.cache.set(this.key(userId, 'items'), this.items()),
      this.cache.set(this.key(userId, 'pending'), [...this.pending]),
      this.cache.set(this.key(userId, 'deleted'), [...this.deleted]),
    ]);
  }

  /** Pushes unsynced deletes and upserts; throws if Supabase is unreachable. */
  private async flush(userId: string): Promise<void> {
    if (this.deleted.size > 0) {
      const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).in('id', [...this.deleted]);
      if (error) {
        throw new Error(error.message);
      }
      this.deleted.clear();
    }
    if (this.pending.size > 0) {
      const rows = this.items().filter((item) => this.pending.has(item.id)).map((item) => itemToRow(item, userId));
      if (rows.length > 0) {
        const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: CONFLICT_COLUMNS });
        if (error) {
          throw new Error(error.message);
        }
      }
      this.pending.clear();
    }
    await this.persistLocal(userId);
  }

  private userId(): string | null {
    return this.auth.currentUser?.id ?? null;
  }

  private key(userId: string, name: 'items' | 'pending' | 'deleted'): string {
    return `${userId}:${name}`;
  }
}
