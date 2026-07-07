import { Injectable, inject } from '@angular/core';
import { Decklist, DecklistCard } from '../../../models/decklist.model';
import { SupabaseService } from '../../../core/services/supabase.service';

export interface CloudDeckRow {
  user_id: string;
  local_id: string;
  name: string;
  cards: DecklistCard[];
  is_public: boolean;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class DeckCloudService {
  private readonly supabase = inject(SupabaseService);

  async fetchUserDecks(userId: string): Promise<Decklist[]> {
    const client = this.supabase.getClient();
    if (!client) {
      return [];
    }

    const { data, error } = await client
      .from('decks')
      .select('local_id, name, cards, updated_at')
      .eq('user_id', userId);

    if (error || !data) {
      throw error ?? new Error('Failed to load cloud decks');
    }

    return data.map((row) => mapRowToDecklist(row));
  }

  async upsertUserDecks(userId: string, decklists: readonly Decklist[]): Promise<void> {
    const client = this.supabase.getClient();
    if (!client || decklists.length === 0) {
      return;
    }

    const rows: CloudDeckRow[] = decklists.map((deck) => ({
      user_id: userId,
      local_id: deck.id,
      name: deck.name,
      cards: deck.cards,
      is_public: false,
      updated_at: deck.updatedAt,
    }));

    const { error } = await client.from('decks').upsert(rows, { onConflict: 'user_id,local_id' });
    if (error) {
      throw error;
    }
  }
}

function mapRowToDecklist(row: Record<string, unknown>): Decklist {
  return {
    id: String(row['local_id']),
    name: String(row['name'] ?? 'Deck'),
    updatedAt: String(row['updated_at'] ?? new Date().toISOString()),
    cards: Array.isArray(row['cards']) ? (row['cards'] as DecklistCard[]) : [],
  };
}
