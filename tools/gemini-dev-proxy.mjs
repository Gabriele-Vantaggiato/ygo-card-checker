/**
 * Local CORS proxy for Gemini Developer API (dev only).
 * Mirrors the official curl shape:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   Header: X-goog-api-key
 *
 * Usage: node tools/gemini-dev-proxy.mjs
 * App calls: http://127.0.0.1:8787/v1beta/models/gemini-flash-latest:generateContent
 */
import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.GEMINI_PROXY_PORT || 8787);
const HOST = '127.0.0.1';
const UPSTREAM = 'generativelanguage.googleapis.com';

function sendCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-goog-api-key, x-goog-api-key',
  );
}

const server = http.createServer((req, res) => {
  sendCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Only POST is supported' } }));
    return;
  }

  const url = req.url || '/';
  if (!url.startsWith('/v1beta/models/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Unknown path ${url}` } }));
    return;
  }

  const apiKey = req.headers['x-goog-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Missing X-goog-api-key header' } }));
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const upstream = https.request(
      {
        hostname: UPSTREAM,
        path: url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
          'Content-Length': body.byteLength,
        },
      },
      (upRes) => {
        const outHeaders = {
          'Content-Type': upRes.headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*',
        };
        res.writeHead(upRes.statusCode || 502, outHeaders);
        upRes.pipe(res);
      },
    );

    upstream.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: err.message || 'Upstream error' } }));
    });

    upstream.write(body);
    upstream.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[gemini-proxy] http://${HOST}:${PORT} → https://${UPSTREAM}`);
});
