/**
 * Vercel Edge Function wrapper for deck health analysis.
 * Accepts POST requests with a decklist card array, fetches the semantic
 * profile index from the static asset, builds a Map, and invokes the pure
 * analyzeDeckHealth function to return a health report.
 */
import { analyzeDeckHealth } from '../src/app/utils/deck-health.utils';
import type { DecklistCard } from '../src/app/models/decklist.model';
import type { SemanticCardProfile } from '../src/app/models/semantic-card.model';

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

interface RequestBody {
  deck: unknown;
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

  if (!Array.isArray(body.deck)) {
    return jsonError(400, 'Missing or invalid "deck" field: expected an array');
  }

  const deck = body.deck as DecklistCard[];

  let semanticExport: SemanticExport;
  try {
    const semanticUrl = new URL('/assets/data/card-knowledge/semantic.json', req.url);
    const semanticResponse = await fetch(semanticUrl.toString());
    if (!semanticResponse.ok) {
      return jsonError(502, `Failed to fetch semantic profiles: ${semanticResponse.statusText}`);
    }
    semanticExport = (await semanticResponse.json()) as SemanticExport;
  } catch (err) {
    return jsonError(
      502,
      `Error fetching semantic profiles: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
  }

  const profileMap = new Map<number, SemanticCardProfile>();
  for (const [cardIdStr, profile] of Object.entries(semanticExport.profiles)) {
    const cardId = parseInt(cardIdStr, 10);
    if (!isNaN(cardId)) {
      profileMap.set(cardId, {
        roles: profile.roles,
        triggers: profile.triggers,
        outcomes: profile.outcomes,
        costFlags: profile.costFlags,
        restrictions: profile.restrictions,
      });
    }
  }

  const report = analyzeDeckHealth(deck, profileMap);

  return new Response(JSON.stringify(report), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
