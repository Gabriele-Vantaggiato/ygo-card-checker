/**
 * Supabase community setup (one-time, ~5 min)
 *
 * 1. Create project at https://supabase.com
 * 2. SQL Editor → run files in supabase/migrations/ (001, 002)
 * 3. Authentication → Providers → enable Google + Discord
 * 4. Authentication → URL Configuration → Site URL + Redirect URLs:
 *    - http://localhost:4200/auth/callback
 *    - https://YOUR_VERCEL_DOMAIN/auth/callback
 * 5. Project Settings → API → copy URL + anon public key
 * 6. Vercel → Environment Variables:
 *    - SUPABASE_URL
 *    - SUPABASE_ANON_KEY
 *    (build runs scripts/write-community-config.mjs automatically)
 *
 * Local dev with auth:
 *   set SUPABASE_URL=https://xxx.supabase.co
 *   set SUPABASE_ANON_KEY=eyJ...
 *   npm start
 */
export const communityConfigExample = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
};
