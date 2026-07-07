/**
 * Copy values into src/app/core/config/community.config.ts
 * (or wire Vercel env → build step later).
 *
 * Supabase Dashboard → Project Settings → API
 * Auth → Providers → Google + Discord
 * Auth → URL Configuration → redirect: https://your-domain/auth/callback
 */
export const communityConfigExample = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
};
