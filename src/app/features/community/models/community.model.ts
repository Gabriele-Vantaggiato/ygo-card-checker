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
}

export interface CommunityIndex {
  profiles: CommunityProfileEntry[];
  publicDecks: CommunityPublicDeckEntry[];
}
