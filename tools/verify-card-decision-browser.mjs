// Production-build smoke test. Supply PLAYWRIGHT_MODULE if Playwright is installed elsewhere.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve('dist/ygo-card-checker/browser');
const names = await readdir(root);
let workerName;
for (const name of names.filter(n => /^worker-.*\.js$/.test(n))) {
  if ((await readFile(resolve(root, name), 'utf8')).includes('Xenova/multilingual-e5-small')) workerName = name;
}
assert.ok(workerName, 'Production decision worker must exist');
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html' };
const server = createServer(async (req, res) => {
  if (req.url === '/__decision_test') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Decision smoke test</title>'); return; }
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream'); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const failed = [];
  page.on('requestfailed', r => failed.push({ url: r.url(), error: r.failure()?.errorText }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/__decision_test`);
  const result = await page.evaluate(async workerName => {
    const start = performance.now();
    const worker = new Worker(`/${workerName}`, { type: 'module' });
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Model timed out')), 90_000);
        worker.onerror = e => { clearTimeout(timer); reject(new Error(e.message)); };
        worker.onmessage = ({ data }) => {
          if (data.kind === 'loading') return;
          clearTimeout(timer); resolve({ ...data, elapsedMs: Math.round(performance.now() - start) });
        };
        worker.postMessage({ kind: 'rank', id: 1, query: 'Voglio negare gli effetti dei mostri avversari', candidates: [
          { cardId: 1, text: 'Destroy one Spell or Trap on the field.' },
          { cardId: 2, text: 'Add one monster from your Deck to your hand.' },
          { cardId: 3, text: 'Negate the activation of an opponent monster effect.' },
          { cardId: 4, text: 'Special Summon one monster from your Graveyard.' },
        ] });
      });
    } finally { worker.terminate(); }
  }, workerName);
  console.log(JSON.stringify({ result, failed }, null, 2));
  assert.equal(result.kind, 'result', 'Actual browser inference must succeed');
  assert.equal(result.scores.length, 4);
  assert.equal([...result.scores].sort((a, b) => b.score - a.score)[0].cardId, 3);
  assert.equal(failed.length, 0, 'Model and same-origin WASM assets must load');
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
