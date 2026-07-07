export interface UserProfile {
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}
