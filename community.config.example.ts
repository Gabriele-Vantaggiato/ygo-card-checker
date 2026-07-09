/**
 * Supabase community setup (one-time, ~5 min)
 *
 * 1. Create project at https://supabase.com
 * 2. SQL Editor → run files in supabase/migrations/ (001, 002)
 * 3. Authentication → Providers → enable Google + Discord
 * 4. Authentication → URL Configuration → Site URL + Redirect URLs:
 *    - http://localhost:4200/auth/callback
 *    - https://YOUR_VERCEL_DOMAIN/auth/callback
 * 5. Project Settings → API → copy URL + publishable (or anon) key
 * 6. Copy .env.local.example → .env.local and fill in values
 *    (build/start runs scripts/write-community-config.mjs automatically)
 *
 * Env var names supported (Angular SPA — no @supabase/ssr needed):
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY
 *
 * Local dev:
 *   npm start
 */
export const communityConfigExample = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
};
