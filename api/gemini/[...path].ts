/**
 * Production counterpart of tools/gemini-dev-proxy.mjs — same stateless CORS
 * relay contract, deployed as a Vercel Edge Function at /api/gemini/*.
 *
 * The Gemini API key travels in the X-goog-api-key header, supplied by the
 * client per request (BYOK — see gemini-coach.service.ts); this function
 * never stores or reads any secret of its own.
 */
export const config = { runtime: 'edge' };

const UPSTREAM_ORIGIN = 'https://generativelanguage.googleapis.com';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-goog-api-key, x-goog-api-key',
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonError(405, 'Only POST is supported');
  }

  const url = new URL(req.url);
  const upstreamPath = url.pathname.replace(/^\/api\/gemini/, '');
  if (!upstreamPath.startsWith('/v1beta/models/')) {
    return jsonError(404, `Unknown path ${upstreamPath}`);
  }

  const apiKey = req.headers.get('x-goog-api-key');
  if (!apiKey) {
    return jsonError(401, 'Missing X-goog-api-key header');
  }

  const body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM_ORIGIN}${upstreamPath}${url.search}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body,
    });
  } catch (err) {
    return jsonError(502, err instanceof Error ? err.message : 'Upstream error');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
