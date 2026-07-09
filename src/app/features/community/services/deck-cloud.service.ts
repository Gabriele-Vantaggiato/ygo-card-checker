import { Injectable, inject } from '@angular/core';
import { Decklist, DecklistCard } from '../../../models/decklist.model';
import { SupabaseService } from '../../../core/services/supabase.service';
import { YdkeService } from '../../../services/ydke.service';

export interface CloudDeckRow {
  user_id: string;
  local_id: string;
  name: string;
  cards: DecklistCard[];
  is_public: boolean;
  ydke: string | null;
  updated_at: string;
}

type FetchedDeckRow = Pick<CloudDeckRow, 'local_id' | 'name' | 'cards' | 'is_public' | 'updated_at'>;

@Injectable({ providedIn: 'root' })
export class DeckCloudService {
  private readonly supabase = inject(SupabaseService);
  private readonly ydke = inject(YdkeService);

  async fetchUserDecks(userId: string): Promise<Decklist[]> {
    const client = this.supabase.getClient();
    if (!client) {
      return [];
    }

    const { data, error } = await client
      .from('decks')
      .select('local_id, name, cards, is_public, updated_at')
      .eq('user_id', userId);

    if (error || !data) {
      throw error ?? new Error('Failed to load cloud decks');
    }

    return (data as FetchedDeckRow[]).map((row) => mapRowToDecklist(row));
  }

  async upsertUserDecks(userId: string, decklists: readonly Decklist[]): Promise<void> {
    const client = this.supabase.getClient();
    if (!client || decklists.length === 0) {
      return;
    }

    const rows: CloudDeckRow[] = decklists.map((deck) => {
      const isPublic = deck.isPublic === true;
      return {
        user_id: userId,
        local_id: deck.id,
        name: deck.name,
        cards: deck.cards,
        is_public: isPublic,
        ydke: isPublic ? this.ydke.encodeDeck(deck) : null,
        updated_at: deck.updatedAt,
      };
    });

    const { error } = await client.from('decks').upsert(rows, { onConflict: 'user_id,local_id' });
    if (error) {
      throw error;
    }
  }
}

function mapRowToDecklist(row: FetchedDeckRow): Decklist {
  return {
    id: row.local_id,
    name: row.name ?? 'Deck',
    updatedAt: row.updated_at ?? new Date().toISOString(),
    cards: Array.isArray(row.cards) ? row.cards : [],
    isPublic: row.is_public === true,
  };
}
