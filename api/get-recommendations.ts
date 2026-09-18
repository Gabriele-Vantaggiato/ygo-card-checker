/**
 * Vercel Edge Function wrapper for deck-building card recommendations.
 * Accepts POST requests with the deck's card ids, queries the live
 * `card_synergies` Postgres table (Supabase) for co-occurrence partners of
 * those ids, fetches the semantic profile + roster static assets, and
 * invokes the pure getSuggestions function to return ranked candidates.
 *
 * Unlike analyze-deck-health.ts, the synergy data is NOT read from a static
 * JSON export — it's queried live from Supabase so newly-synced tournament
 * decklists are reflected immediately without a rebuild/redeploy.
 */
import { supabase } from '../src/app/core/supabase-client';
import { getSuggestions } from '../src/app/utils/deck-recommendation.utils';
import type { SynergyIndex } from '../src/app/models/deck-recommendation.model';
import type { SemanticCardProfile } from '../src/app/models/semantic-card.model';
import type { CardKnowledgeRosterMember } from '../src/app/models/card-knowledge.model';

export const config = { runtime: 'edge' };

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

interface SemanticExport {
  version: number;
  generatedAt: string;
  cardCount: number;
  profiles: Record<
    string,
    Omit<SemanticCardProfile, 'mentionsCardIds'> & { mentionsCardIds: number[] }
  >;
}

interface RosterExport {
  version: number;
  generatedAt: string;
  cardCount: number;
  roster: Record<string, CardKnowledgeRosterMember>;
}

interface CardSynergyRow {
  card_a: number;
  card_b: number;
  deck_count: number;
}

interface RequestBody {
  deckCardIds: unknown;
  quantities?: unknown;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonError(405, 'Only POST is supported');
  }

  let body: RequestBody;
  try {
    const text = await req.text();
    body = JSON.parse(text);
  } catch {
    return jsonError(400, 'Invalid JSON in request body');
  }

  if (
    !Array.isArray(body.deckCardIds) ||
    body.deckCardIds.length === 0 ||
    !body.deckCardIds.every((id) => typeof id === 'number' && Number.isFinite(id))
  ) {
    return jsonError(400, 'Missing or invalid "deckCardIds" field: expected a non-empty array of numbers');
  }

  const deckCardIds = body.deckCardIds as number[];

  let quantitiesInput: Record<string, number> | undefined;
  if (body.quantities !== undefined) {
    if (
      typeof body.quantities !== 'object' ||
      body.quantities === null ||
      Array.isArray(body.quantities)
    ) {
      return jsonError(400, 'Invalid "quantities" field: expected an object keyed by card id');
    }
    quantitiesInput = body.quantities as Record<string, number>;
  }

  const deckQuantities = new Map<number, number>();
  for (const cardId of deckCardIds) {
    const quantity = quantitiesInput?.[String(cardId)];
    deckQuantities.set(cardId, typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : 1);
  }

  let synergyRows: CardSynergyRow[];
  try {
    const [byCardA, byCardB] = await Promise.all([
      supabase.from('card_synergies').select('card_a, card_b, deck_count').in('card_a', deckCardIds),
      supabase.from('card_synergies').select('card_a, card_b, deck_count').in('card_b', deckCardIds),
    ]);

    if (byCardA.error) {
      return jsonError(502, `Error querying card_synergies (card_a): ${byCardA.error.message}`);
    }
    if (byCardB.error) {
      return jsonError(502, `Error querying card_synergies (card_b): ${byCardB.error.message}`);
    }

    synergyRows = [...(byCardA.data ?? []), ...(byCardB.data ?? [])];
  } catch (err) {
    return jsonError(
      502,
      `Error querying card_synergies: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
  }

  const deckIdSet = new Set(deckCardIds);
  const partners: Record<string, Array<{ cardId: number; deckCount: number }>> = {};
  const addPartner = (from: number, to: number, deckCount: number): void => {
    const key = String(from);
    const bucket = partners[key] ?? [];
    bucket.push({ cardId: to, deckCount });
    partners[key] = bucket;
  };
  for (const row of synergyRows) {
    if (deckIdSet.has(row.card_a)) {
      addPartner(row.card_a, row.card_b, row.deck_count);
    }
    if (deckIdSet.has(row.card_b)) {
      addPartner(row.card_b, row.card_a, row.deck_count);
    }
  }

  const synergyIndex: SynergyIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalDecks: 0,
    partners,
  };

  let semanticExport: SemanticExport;
  let rosterExport: RosterExport;
  try {
    const semanticUrl = new URL('/assets/data/card-knowledge/semantic.json', req.url);
    const rosterUrl = new URL('/assets/data/card-knowledge/roster.json', req.url);
    const [semanticResponse, rosterResponse] = await Promise.all([
      fetch(semanticUrl.toString()),
      fetch(rosterUrl.toString()),
    ]);

    if (!semanticResponse.ok) {
      return jsonError(502, `Failed to fetch semantic profiles: ${semanticResponse.statusText}`);
    }
    if (!rosterResponse.ok) {
      return jsonError(502, `Failed to fetch roster: ${rosterResponse.statusText}`);
    }

    semanticExport = (await semanticResponse.json()) as SemanticExport;
    rosterExport = (await rosterResponse.json()) as RosterExport;
  } catch (err) {
    return jsonError(
      502,
      `Error fetching card knowledge assets: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
  }

  const semanticProfiles = new Map<number, SemanticCardProfile>();
  for (const [cardIdStr, profile] of Object.entries(semanticExport.profiles)) {
    const cardId = parseInt(cardIdStr, 10);
    if (!isNaN(cardId)) {
      semanticProfiles.set(cardId, {
        roles: profile.roles,
        triggers: profile.triggers,
        outcomes: profile.outcomes,
        costFlags: profile.costFlags,
        restrictions: profile.restrictions,
        mentionsCardIds: profile.mentionsCardIds,
      });
    }
  }

  const roster = new Map<number, CardKnowledgeRosterMember>();
  for (const [cardIdStr, member] of Object.entries(rosterExport.roster)) {
    const cardId = parseInt(cardIdStr, 10);
    if (!isNaN(cardId)) {
      roster.set(cardId, member);
    }
  }

  const recommendations = getSuggestions(deckQuantities, synergyIndex, semanticProfiles, roster, {});

  return new Response(JSON.stringify(recommendations), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
