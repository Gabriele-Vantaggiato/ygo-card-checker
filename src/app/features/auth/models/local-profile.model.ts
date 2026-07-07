import { FavoriteCardRef, TournamentEntry } from '../../community/models/community.model';

export interface LocalProfile {
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  favoriteCard: FavoriteCardRef | null;
  tournaments: TournamentEntry[];
  updatedAt: string;
}

export const EMPTY_LOCAL_PROFILE: LocalProfile = {
  displayName: '',
  handle: '',
  bio: '',
  avatarUrl: null,
  favoriteCard: null,
  tournaments: [],
  updatedAt: new Date().toISOString(),
};
