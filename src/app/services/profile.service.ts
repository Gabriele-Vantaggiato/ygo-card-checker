import { Injectable } from '@angular/core';
import { customAlphabet } from 'nanoid';
import { supabase } from '../core/supabase-client';
import { DecklistCard } from '../models/decklist.model';
import { AuthService } from './auth.service';

export interface Profile {
  id: string;
  username: string;
  friendCode: string;
  avatarCardId: number | null;
  createdAt: string;
}

export interface PublicDeck {
  id: string;
  ownerId: string;
  name: string;
  coverCardIds: number[];
  cards: DecklistCard[];
  format: string | null;
  updatedAt: string;
}

export interface DeckMessage {
  id: number;
  deckId: string;
  userId: string;
  authorUsername: string | null;
  body: string;
  createdAt: string;
}

const generatePublicDeckId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

interface ProfileRow {
  id: string;
  username: string;
  friend_code: string;
  avatar_card_id: number | null;
  created_at: string;
}

interface PublicDeckRow {
  id: string;
  owner_id: string;
  local_deck_id: number;
  name: string;
  cover_card_ids: number[];
  cards: DecklistCard[];
  format: string | null;
  updated_at: string;
}

function rowToProfile(row: ProfileRow): Profile {
  return { id: row.id, username: row.username, friendCode: row.friend_code, avatarCardId: row.avatar_card_id, createdAt: row.created_at };
}

function rowToPublicDeck(row: PublicDeckRow): PublicDeck {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    coverCardIds: row.cover_card_ids,
    cards: row.cards,
    format: row.format,
    updatedAt: row.updated_at,
  };
}

/** Deterministic bigint from a deck uuid — public_decks.local_deck_id is a legacy
 * NOT NULL bigint column from before decks used uuid ids; this satisfies it without
 * needing an actual integer-keyed local deck store. */
function stableBigintFromUuid(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 15);
  return parseInt(hex, 16) % 9_000_000_000_000_000;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  constructor(private readonly authService: AuthService) {}

  async getOwnProfile(): Promise<Profile | null> {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      return null;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, friend_code, avatar_card_id, created_at')
      .eq('id', userId)
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return rowToProfile(data);
  }

  async updateUsername(username: string): Promise<void> {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      throw new Error('Not logged in');
    }
    const trimmed = username.trim();
    if (!trimmed) {
      throw new Error('Username non può essere vuoto.');
    }
    const { error } = await supabase.from('profiles').update({ username: trimmed }).eq('id', userId);
    if (error) {
      throw new Error(error.message);
    }
  }

  async updateAvatarCardId(cardId: number | null): Promise<void> {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      throw new Error('Not logged in');
    }
    const { error } = await supabase.from('profiles').update({ avatar_card_id: cardId }).eq('id', userId);
    if (error) {
      throw new Error(error.message);
    }
  }

  async listOwnPublicDecks(): Promise<PublicDeck[]> {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      return [];
    }
    const { data, error } = await supabase
      .from('public_decks')
      .select('id, owner_id, local_deck_id, name, cover_card_ids, cards, format, updated_at')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });
    if (error) {
      throw new Error(error.message);
    }
    return (data as PublicDeckRow[]).map(rowToPublicDeck);
  }

  async getPublicDeckById(id: string): Promise<PublicDeck | null> {
    const { data, error } = await supabase
      .from('public_decks')
      .select('id, owner_id, local_deck_id, name, cover_card_ids, cards, format, updated_at')
      .eq('id', id)
      .single();
    if (error) {
      return null;
    }
    return rowToPublicDeck(data as PublicDeckRow);
  }

  /** Publishes a private synced deck (see DeckSyncService) to the profile. Re-publishing the
   * same source deck (by localDeckId) updates the existing row instead of creating a duplicate. */
  async publishDeck(input: {
    sourceDeckId: string;
    name: string;
    cards: DecklistCard[];
    format: string | null;
  }): Promise<PublicDeck> {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      throw new Error('Not logged in');
    }
    const localDeckId = stableBigintFromUuid(input.sourceDeckId);

    const { data: existing } = await supabase
      .from('public_decks')
      .select('id')
      .eq('owner_id', userId)
      .eq('local_deck_id', localDeckId)
      .maybeSingle();

    const coverCardIds = input.cards
      .filter((card) => (card.section ?? 'main') === 'main' && card.type.includes('Monster'))
      .slice(0, 3)
      .map((card) => card.id);

    const row = {
      id: existing?.id ?? generatePublicDeckId(),
      owner_id: userId,
      local_deck_id: localDeckId,
      name: input.name,
      cover_card_ids: coverCardIds,
      cards: input.cards,
      format: input.format,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('public_decks').upsert(row, { onConflict: 'id' }).select().single();
    if (error) {
      throw new Error(error.message);
    }
    return rowToPublicDeck(data as PublicDeckRow);
  }

  async unpublishDeck(publicDeckId: string): Promise<void> {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      throw new Error('Not logged in');
    }
    const { error } = await supabase.from('public_decks').delete().eq('id', publicDeckId).eq('owner_id', userId);
    if (error) {
      throw new Error(error.message);
    }
  }

  async listComments(deckId: string): Promise<DeckMessage[]> {
    const { data, error } = await supabase
      .from('deck_messages')
      .select('id, deck_id, user_id, body, created_at, profiles(username)')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    return (data as unknown as Array<{
      id: number;
      deck_id: string;
      user_id: string;
      body: string;
      created_at: string;
      profiles: { username: string } | null;
    }>).map((row) => ({
      id: row.id,
      deckId: row.deck_id,
      userId: row.user_id,
      authorUsername: row.profiles?.username ?? null,
      body: row.body,
      createdAt: row.created_at,
    }));
  }

  async postComment(deckId: string, body: string): Promise<void> {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      throw new Error('Devi accedere per commentare.');
    }
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    const { error } = await supabase
      .from('deck_messages')
      .insert({ deck_id: deckId, user_id: userId, body: trimmed, lang: 'it' });
    if (error) {
      throw new Error(error.message);
    }
  }
}
