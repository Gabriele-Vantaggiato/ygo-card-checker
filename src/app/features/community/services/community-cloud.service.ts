import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { DecklistCard } from '../../../models/decklist.model';
import { deckTileCoverImage } from '../../../shared/utils/deck-display.utils';
import {
  CommunityProfileEntry,
  CommunityPublicDeckEntry,
} from '../models/community.model';
import { normalizeHandle } from './community-index.service';

interface ProfileRow {
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  updated_at: string;
}

interface PublicDeckRow {
  id: string;
  local_id: string;
  name: string;
  cards: DecklistCard[] | null;
  ydke: string | null;
  updated_at: string;
  profiles: JoinedProfile | null;
}

type JoinedProfile = {
  handle: string | null;
  display_name: string | null;
};

type RawPublicDeckRow = Omit<PublicDeckRow, 'profiles'> & {
  profiles: JoinedProfile | JoinedProfile[] | null;
};

@Injectable({ providedIn: 'root' })
export class CommunityCloudService {
  private readonly supabase = inject(SupabaseService);

  enabled(): boolean {
    return this.supabase.enabled();
  }

  async fetchProfiles(): Promise<CommunityProfileEntry[]> {
    const client = this.supabase.getClient();
    if (!client) {
      return [];
    }

    const { data, error } = await client
      .from('profiles')
      .select('handle, display_name, bio, updated_at')
      .not('handle', 'is', null);

    if (error || !data) {
      throw error ?? new Error('Failed to load profiles');
    }

    const profiles = data as ProfileRow[];
    const counts = await this.fetchPublicDeckCounts();

    return profiles
      .filter((row) => row.handle?.trim())
      .map((row) => {
        const handle = normalizeHandle(row.handle!);
        return {
          handle,
          displayName: row.display_name?.trim() || handle,
          bio: row.bio?.trim() ?? '',
          favoriteCard: null,
          tournaments: [],
          publicDeckCount: counts.get(handle) ?? 0,
          updatedAt: row.updated_at,
        };
      });
  }

  async fetchPublicDecks(): Promise<CommunityPublicDeckEntry[]> {
    const client = this.supabase.getClient();
    if (!client) {
      return [];
    }

    const { data, error } = await client
      .from('decks')
      .select('id, local_id, name, cards, ydke, updated_at, profiles!inner(handle, display_name)')
      .eq('is_public', true);

    if (error || !data) {
      throw error ?? new Error('Failed to load public decks');
    }

    return (data as unknown as RawPublicDeckRow[])
      .map((row) => ({ ...row, profiles: normalizeJoinedProfile(row.profiles) }))
      .filter((row) => row.profiles?.handle?.trim())
      .map((row) => mapPublicDeckRow(row));
  }

  private async fetchPublicDeckCounts(): Promise<Map<string, number>> {
    const client = this.supabase.getClient();
    if (!client) {
      return new Map();
    }

    const { data, error } = await client
      .from('decks')
      .select('profiles!inner(handle)')
      .eq('is_public', true);

    if (error || !data) {
      return new Map();
    }

    const counts = new Map<string, number>();
    for (const row of data as unknown as { profiles: JoinedProfile | JoinedProfile[] | null }[]) {
      const profile = normalizeJoinedProfile(row.profiles);
      const handle = profile?.handle;
      if (!handle?.trim()) {
        continue;
      }
      const normalized = normalizeHandle(handle);
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    return counts;
  }
}

function normalizeJoinedProfile(
  profiles: JoinedProfile | JoinedProfile[] | null | undefined,
): JoinedProfile | null {
  if (!profiles) {
    return null;
  }
  return Array.isArray(profiles) ? (profiles[0] ?? null) : profiles;
}

function mapPublicDeckRow(row: PublicDeckRow): CommunityPublicDeckEntry {
  const ownerHandle = normalizeHandle(row.profiles!.handle!);
  const ownerDisplayName = row.profiles!.display_name?.trim() || ownerHandle;
  const cards = Array.isArray(row.cards) ? row.cards : [];
  const total = cards.reduce((sum, card) => sum + (card.quantity ?? 1), 0);
  const unique = new Set(cards.map((card) => card.id)).size;

  return {
    deckId: row.local_id,
    cloudId: row.id,
    ownerHandle,
    ownerDisplayName,
    deckName: row.name,
    cardCount: total,
    uniqueCount: unique,
    coverImage: cards.length > 0 ? deckTileCoverImage({ id: row.local_id, name: row.name, updatedAt: row.updated_at, cards }) : null,
    formatLabel: '—',
    updatedAt: row.updated_at,
    ydkeUrl: row.ydke,
    isRemote: true,
  };
}
