/**
 * Vercel Cron Job (weekly) — recomputes card_synergies(source='user_decks')
 * from all users' saved decks.
 *
 * Reads every deck's main-section card ids and counts, per unordered card
 * pair, the number of DISTINCT decks that contain both cards. Upserts the
 * result into `card_synergies` keyed on (card_a, card_b, source).
 *
 * Needs elevated DB access: `decks` RLS (see src/app/services/deck-sync.service.ts)
 * only lets the publishable/anon key read a user's OWN rows or PUBLIC rows, but this
 * job must read every user's decks (public and private) to build accurate synergy
 * counts. It therefore requires a service-role key — see SUPABASE_SERVICE_ROLE_KEY
 * below — never the publishable key from src/app/core/supabase-client.ts.
 */
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

// Same project as src/app/core/supabase-client.ts — intentionally not imported from
// there, since that module exports a publishable-key client meant for the browser,
// and this function needs a separate service-role client that must never ship client-side.
const SUPABASE_URL = 'https://ubflewrwtpbrbkjdohfx.supabase.co';

const CARD_SYNERGY_BATCH_SIZE = 5000;

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type DeckSection = 'main' | 'extra' | 'side';

interface DeckCardRow {
  id: number;
  section?: DeckSection;
  [key: string]: unknown;
}

interface DeckRow {
  id: string;
  cards: DeckCardRow[] | null;
}

interface SynergyRow {
  card_a: number;
  card_b: number;
  deck_count: number;
  source: 'user_decks';
  updated_at: string;
}

function mainSectionCardIds(cards: DeckCardRow[] | null): Set<number> {
  const ids = new Set<number>();
  if (!Array.isArray(cards)) {
    return ids;
  }
  for (const card of cards) {
    if (typeof card?.id !== 'number') {
      continue;
    }
    if ((card.section ?? 'main') === 'main') {
      ids.add(card.id);
    }
  }
  return ids;
}

export default async function handler(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return jsonError(401, 'Unauthorized');
  }

  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return jsonError(500, 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
    }

    // Separate admin client, used ONLY for this cross-user read — never reuse the
    // publishable-key client from supabase-client.ts for this.
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: decks, error: decksError } = await supabaseAdmin
      .from('decks')
      .select('id, cards');

    if (decksError) {
      return jsonError(502, `Failed to read decks: ${decksError.message}`);
    }

    const pairCounts = new Map<string, number>();

    for (const deck of (decks ?? []) as DeckRow[]) {
      const mainIds = Array.from(mainSectionCardIds(deck.cards)).sort((a, b) => a - b);
      for (let i = 0; i < mainIds.length; i++) {
        for (let j = i + 1; j < mainIds.length; j++) {
          const cardA = mainIds[i];
          const cardB = mainIds[j];
          const key = `${cardA}_${cardB}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    const updatedAt = new Date().toISOString();
    const rows: SynergyRow[] = Array.from(pairCounts.entries()).map(([key, deckCount]) => {
      const [cardA, cardB] = key.split('_').map(Number);
      return { card_a: cardA, card_b: cardB, deck_count: deckCount, source: 'user_decks', updated_at: updatedAt };
    });

    for (let i = 0; i < rows.length; i += CARD_SYNERGY_BATCH_SIZE) {
      const batch = rows.slice(i, i + CARD_SYNERGY_BATCH_SIZE);
      const { error: upsertError } = await supabaseAdmin
        .from('card_synergies')
        .upsert(batch, { onConflict: 'card_a,card_b,source' });
      if (upsertError) {
        return jsonError(502, `Failed to upsert card_synergies: ${upsertError.message}`);
      }
    }

    return new Response(
      JSON.stringify({ decksScanned: (decks ?? []).length, pairsUpserted: rows.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Unknown error');
  }
}
