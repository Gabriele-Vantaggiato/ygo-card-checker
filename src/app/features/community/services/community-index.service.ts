import { Injectable, inject, signal } from '@angular/core';
import { Decklist, DecklistStorage } from '../../../models/decklist.model';
import { LocalProfile } from '../../auth/models/local-profile.model';
import { LocalProfileService } from '../../auth/services/local-profile.service';
import { DecklistService } from '../../../services/decklist.service';
import { FormatStore } from '../../../core/stores/format.store';
import { I18nService } from '../../../services/i18n.service';
import { deckTileCoverImage } from '../../../shared/utils/deck-display.utils';
import {
  CommunityIndex,
  CommunityProfileEntry,
  CommunityPublicDeckEntry,
} from '../models/community.model';

const STORAGE_KEY = 'ygo-checker-community-index';

@Injectable({ providedIn: 'root' })
export class CommunityIndexService {
  private readonly profiles = inject(LocalProfileService);
  private readonly decklists = inject(DecklistService);
  private readonly formatStore = inject(FormatStore);
  private readonly i18n = inject(I18nService);

  private readonly index = signal<CommunityIndex>(this.load());

  readonly profilesIndex = () => this.index().profiles;
  readonly publicDecksIndex = () => this.index().publicDecks;

  rebuildFromLocal(): void {
    const profile = this.profiles.load();
    const storage = this.decklists.load();
    const formatLabel = this.formatStore.selectedFormat()?.name[this.i18n.lang()] ?? '—';
    const next = this.load();

    if (profile?.handle.trim()) {
      const handle = normalizeHandle(profile.handle);
      const entry = this.toProfileEntry(profile, storage, handle);
      next.profiles = [...next.profiles.filter((item) => item.handle !== handle), entry];
    }

    const ownerHandle = profile?.handle.trim() ? normalizeHandle(profile.handle) : '';
    const ownerName = profile?.displayName ?? 'Duelist';
    next.publicDecks = next.publicDecks.filter((item) => item.ownerHandle !== ownerHandle);

    if (ownerHandle) {
      const publicDecks = storage.decklists
        .filter((deck) => deck.isPublic)
        .map((deck) => this.toPublicDeckEntry(deck, ownerHandle, ownerName, formatLabel));
      next.publicDecks.push(...publicDecks);
    }

    this.save(next);
  }

  searchProfiles(query: string): CommunityProfileEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.index().profiles;
    }
    return this.index().profiles.filter(
      (profile) =>
        profile.displayName.toLowerCase().includes(q) || profile.handle.toLowerCase().includes(q),
    );
  }

  searchPublicDecks(query: string): CommunityPublicDeckEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.index().publicDecks;
    }
    return this.index().publicDecks.filter(
      (deck) =>
        deck.deckName.toLowerCase().includes(q) ||
        deck.ownerHandle.toLowerCase().includes(q) ||
        deck.ownerDisplayName.toLowerCase().includes(q),
    );
  }

  profileByHandle(handle: string): CommunityProfileEntry | null {
    const normalized = normalizeHandle(handle);
    return this.index().profiles.find((profile) => profile.handle === normalized) ?? null;
  }

  publicDecksByHandle(handle: string): CommunityPublicDeckEntry[] {
    const normalized = normalizeHandle(handle);
    return this.index().publicDecks.filter((deck) => deck.ownerHandle === normalized);
  }

  private toProfileEntry(
    profile: LocalProfile,
    storage: DecklistStorage,
    handle: string,
  ): CommunityProfileEntry {
    return {
      handle,
      displayName: profile.displayName,
      bio: profile.bio,
      favoriteCard: profile.favoriteCard,
      tournaments: profile.tournaments,
      publicDeckCount: storage.decklists.filter((deck) => deck.isPublic).length,
      updatedAt: profile.updatedAt,
    };
  }

  private toPublicDeckEntry(
    deck: Decklist,
    ownerHandle: string,
    ownerDisplayName: string,
    formatLabel: string,
  ): CommunityPublicDeckEntry {
    const unique = new Set(deck.cards.map((card) => card.id)).size;
    const total = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
    return {
      deckId: deck.id,
      ownerHandle,
      ownerDisplayName,
      deckName: deck.name,
      cardCount: total,
      uniqueCount: unique,
      coverImage: deckTileCoverImage(deck),
      formatLabel,
      updatedAt: deck.updatedAt,
    };
  }

  private load(): CommunityIndex {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { profiles: [], publicDecks: [] };
      }
      const parsed = JSON.parse(raw) as CommunityIndex;
      return {
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        publicDecks: Array.isArray(parsed.publicDecks) ? parsed.publicDecks : [],
      };
    } catch {
      return { profiles: [], publicDecks: [] };
    }
  }

  private save(index: CommunityIndex): void {
    this.index.set(index);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
  }
}

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/\s+/g, '_');
}
