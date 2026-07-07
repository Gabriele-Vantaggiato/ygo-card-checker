/** Supabase community MVP — leave empty to keep guest-only mode. */
export const communityConfig = {
  supabaseUrl: '',
  supabaseAnonKey: '',
} as const;

export function isCommunityEnabled(): boolean {
  return communityConfig.supabaseUrl.trim().length > 0 && communityConfig.supabaseAnonKey.trim().length > 0;
}
