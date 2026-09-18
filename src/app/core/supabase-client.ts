import { createClient } from '@supabase/supabase-js';

/**
 * Public project URL + publishable key — safe to ship to the browser. All real
 * access control lives in Postgres Row Level Security (see the `decks` and
 * `card_synergies` policies), not in keeping this value secret.
 */
const SUPABASE_URL = 'https://ubflewrwtpbrbkjdohfx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AZ_4OeVom8-iq7xFuaFydA_RyumSzFu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
