/**
 * Configure Supabase Auth (OAuth providers + redirect URLs) via Management API.
 *
 * Prerequisites:
 * 1. Personal access token: https://supabase.com/dashboard/account/tokens
 * 2. Google OAuth app: https://console.cloud.google.com/apis/credentials
 * 3. Discord OAuth app: https://discord.com/developers/applications
 *
 * Redirect URI for Google/Discord apps:
 *   https://ilcevfnevhlsufftnvag.supabase.co/auth/v1/callback
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
 *   $env:GOOGLE_CLIENT_ID="..."
 *   $env:GOOGLE_CLIENT_SECRET="..."
 *   $env:DISCORD_CLIENT_ID="..."
 *   $env:DISCORD_CLIENT_SECRET="..."
 *   node scripts/configure-supabase-oauth.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_REF = 'ilcevfnevhlsufftnvag';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(root, '.env'));
loadEnvFile(join(root, '.env.local'));

const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
const googleId = process.env.GOOGLE_CLIENT_ID ?? '';
const googleSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
const discordId = process.env.DISCORD_CLIENT_ID ?? '';
const discordSecret = process.env.DISCORD_CLIENT_SECRET ?? '';

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN.');
  console.error('Create one at https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const body = {
  site_url: 'http://localhost:4200',
  uri_allow_list: 'http://localhost:4200/**,http://localhost:4200/auth/callback',
};

if (googleId && googleSecret) {
  body.external_google_enabled = true;
  body.external_google_client_id = googleId;
  body.external_google_secret = googleSecret;
} else {
  console.warn('[oauth] Google credentials missing — skipping Google provider.');
}

if (discordId && discordSecret) {
  body.external_discord_enabled = true;
  body.external_discord_client_id = discordId;
  body.external_discord_secret = discordSecret;
} else {
  console.warn('[oauth] Discord credentials missing — skipping Discord provider.');
}

if (!body.external_google_enabled && !body.external_discord_enabled) {
  console.error('No OAuth provider credentials found. Set GOOGLE_* and/or DISCORD_* env vars.');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`Auth config failed (${res.status}):`, text);
  process.exit(1);
}

const result = await res.json();
console.log('[oauth] Supabase auth config updated.');
console.log('  site_url:', result.site_url ?? body.site_url);
console.log('  google:', result.external_google_enabled ?? body.external_google_enabled ?? false);
console.log('  discord:', result.external_discord_enabled ?? body.external_discord_enabled ?? false);
