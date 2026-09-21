/** Optional server-side relay for free OpenRouter models.
 * The key stays in Vercel environment variables and is never sent to the browser.
 */
export const config = { runtime: 'edge' };

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-OpenRouter-Key',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Only POST is supported' });

  const apiKey = req.headers.get('x-openrouter-key');
  if (!apiKey) return json(503, { error: 'Open model provider is not configured' });

  let input: { prompt?: unknown; model?: unknown };
  try {
    input = await req.json() as { prompt?: unknown; model?: unknown };
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const prompt = typeof input.prompt === 'string' ? input.prompt.trim().slice(0, 12000) : '';
  if (!prompt) return json(400, { error: 'prompt is required' });

  const configuredModel = process.env.OPENROUTER_MODEL?.trim();
  const requestedModel = typeof input.model === 'string' ? input.model.trim().slice(0, 160) : '';
  const model = requestedModel || configuredModel || 'openrouter/free';

  let upstream: Response;
  try {
    upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.PUBLIC_SITE_URL || new URL(req.url).origin,
        'X-Title': 'YGOChecker',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1400,
        stream: false,
      }),
    });
  } catch {
    return json(502, { error: 'Open model provider is unreachable' });
  }

  if (!upstream.ok) {
    return json(upstream.status === 429 ? 429 : 502, { error: 'Open model provider request failed' });
  }

  const payload = await upstream.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const text = payload.choices?.[0]?.message?.content;
  return json(200, { text: typeof text === 'string' ? text : '', model });
}
