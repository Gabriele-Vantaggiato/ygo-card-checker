export interface FavoriteCardRef {
  id: number;
  name: string;
  imageUrlSmall: string | null;
}

export interface TournamentEntry {
  id: string;
  name: string;
  eventDate: string;
  formatLabel: string;
  placement: string;
}

export interface CommunityProfileEntry {
  handle: string;
  displayName: string;
  bio: string;
  favoriteCard: FavoriteCardRef | null;
  tournaments: TournamentEntry[];
  publicDeckCount: number;
  updatedAt: string;
}

export interface CommunityPublicDeckEntry {
  deckId: string;
  ownerHandle: string;
  ownerDisplayName: string;
  deckName: string;
  cardCount: number;
  uniqueCount: number;
  coverImage: string | null;
  formatLabel: string;
  updatedAt: string;
  /** Supabase row id when loaded from cloud. */
  cloudId?: string;
  /** YDKE URL for published cloud decks. */
  ydkeUrl?: string | null;
  /** True when the deck belongs to another user/device. */
  isRemote?: boolean;
}

export interface CommunityIndex {
  profiles: CommunityProfileEntry[];
  publicDecks: CommunityPublicDeckEntry[];
}
