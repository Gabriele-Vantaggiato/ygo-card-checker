import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

export function coachOrigins(input = '') {
  const origins = [...new Set(['http://127.0.0.1:4201','http://localhost:4201','http://localhost:4200',...input.split(',').map(value => value.trim()).filter(Boolean)])];
  if (origins.some(origin => { try { const url = new URL(origin); return !['http:','https:'].includes(url.protocol) || url.origin !== origin; } catch { return true; } })) throw new Error('Invalid allowed origin');
  return origins;
}

export function parseNativeDeck(config, ydk) {
  const name = /^DeckInUse->(.+)$/m.exec(config)?.[1]?.trim();
  if (!name || name.length > 180 || /[\\/\x00-\x1f]/.test(name) || ['.','..'].includes(name)) throw new Error('Invalid selected deck');
  const sections = { main: [],extra: [],side: [] }; let section = 'main';
  if (ydk.length > 100000) throw new Error('YDK too large');
  for (const raw of ydk.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '#main') section = 'main'; else if (line === '#extra') section = 'extra'; else if (line === '!side') section = 'side';
    else if (/^\d+$/.test(line)) { const id = Number(line); if (!id || id > 999999999) throw new Error('Invalid passcode'); sections[section].push(id); }
    else if (line && !line.startsWith('#')) throw new Error('Invalid YDK line');
  }
  if (!sections.main.length || sections.main.length > 60 || sections.extra.length > 15 || sections.side.length > 15) throw new Error('Invalid deck sizes');
  const base64 = ids => { const bytes = Buffer.alloc(ids.length*4); ids.forEach((id,i) => bytes.writeUInt32LE(id,i*4)); return bytes.toString('base64'); };
  return { name,ydke: `ydke://${base64(sections.main)}!${base64(sections.extra)}!${base64(sections.side)}!` };
}
async function smallFile(path, max) {
  if ((await stat(path)).size > max) throw new Error('File too large');
  const text = await readFile(path,'utf8'); if (text.length > max) throw new Error('File too large'); return text;
}
export function createMdproBridge({ gameRoot, captureRoot, origins, observerKey = '' }) {
  const game = resolve(gameRoot), captures = resolve(captureRoot);
  let hint = { active: false,message: 'Coach pronto: scegli mazzo e mano nel sito.',updatedAt: 0 };
  let live = null;
  let cache = null, cachedAt = 0, pending = null;
  async function snapshot() {
    if (cache && Date.now()-cachedAt < 1500) return cache;
    if (pending) return pending;
    pending = (async () => {
      const config = await smallFile(join(game,'Data','config.conf'),100000);
      const name = /^DeckInUse->(.+)$/m.exec(config)?.[1]?.trim();
      if (!name || basename(name) !== name || /[\\/\x00-\x1f]/.test(name) || ['.','..'].includes(name)) throw new Error('Invalid selected deck');
      const deckPath = resolve(game,'Deck',name.endsWith('.ydk') ? name : `${name}.ydk`);
      if (!deckPath.startsWith(resolve(game,'Deck') + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Deck outside directory');
      const activeDeck = parseNativeDeck(config,await smallFile(deckPath,100000));
      let capture = null;
      try {
        const files = (await readdir(captures)).filter(name => /^[a-f0-9-]{36}\.json$/i.test(name));
        if (files.length > 500) throw new Error('Too many captures');
        const dates = await Promise.all(files.map(async name => ({ name,time: (await stat(join(captures,name))).mtimeMs })));
        for (const entry of dates.sort((a,b) => b.time-a.time).slice(0,5)) {
          const envelope = JSON.parse(await smallFile(join(captures,entry.name),2000000));
          const sheet = envelope?.sheet;
          // Only native Test Hand captures; remote ownership/pending metadata never leaves this helper.
          if (sheet?.schemaVersion !== 1 || !String(sheet.title).startsWith('Test Hand ') || sheet.tabs?.length !== 1 || sheet.tabs[0].combos?.length !== 1) continue;
          const guide = sheet.tabs[0].combos[0];
          if (!Array.isArray(guide.startingCards) || guide.startingCards.length < 5 || !Array.isArray(guide.steps) || !guide.steps.length) continue;
          capture = { id: sheet.id,updated: entry.time,sheet }; break;
        }
      } catch { /* Deck suggestions work without a capture directory. */ }
      cache = { schemaVersion: 1,activeDeck,capture }; cachedAt = Date.now(); return cache;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return createServer(async (req,res) => {
    if (req.method === 'POST' && req.url === '/native') {
      if (!observerKey || req.headers['x-mdpro-observer-key'] !== observerKey) { res.writeHead(403); res.end(); return; }
      let body = '';
      try {
        for await (const chunk of req) { body += chunk.toString('utf8'); if (body.length > 2000000) throw new Error('Snapshot too large'); }
        const input = JSON.parse(body);
        if (typeof input.active !== 'boolean') throw new Error('Invalid native state');
        if (input.active && (typeof input.sessionId !== 'string' || input.sessionId.length > 120 || input.sheet?.schemaVersion !== 1 || typeof input.sheet.id !== 'string' || input.sheet.tabs?.length !== 1 || input.sheet.tabs[0].combos?.length !== 1)) throw new Error('Unsupported native schema');
        const changed = input.active && input.sessionId !== live?.sessionId;
        if (changed) { cache = null; cachedAt = 0; }
        const deck = input.active ? (await snapshot()).activeDeck : null;
        live = { active: input.active,limited: input.limited !== false,sessionId: input.sessionId || '',sheet: input.active ? input.sheet : null,
          observedAt: Date.now(),deck: changed || !live?.deck ? deck : live.deck,pid: Number.isSafeInteger(input.pid) ? input.pid : null };
        res.writeHead(204); res.end();
      } catch { live = null; res.writeHead(400); res.end(); }
      return;
    }
    const origin = req.headers.origin;
    res.setHeader('Cache-Control','no-store'); res.setHeader('Vary','Origin');
    if (!origin || !origins.includes(origin)) { res.writeHead(403); res.end('Origin not allowed'); return; }
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network','true');
    if (req.method === 'OPTIONS' && ['/snapshot','/coach','/overlay'].includes(req.url)) { res.writeHead(204); res.end(); return; }
    if (req.method === 'POST' && req.url === '/coach') {
      let body = '';
      try {
        for await (const chunk of req) { body += chunk.toString('utf8'); if (body.length > 20000) throw new Error('Hint too large'); }
        const next = JSON.parse(body);
        if (typeof next.active !== 'boolean' || typeof next.message !== 'string' || next.message.length > 500 ||
            !Array.isArray(next.hand) || next.hand.length > 15 || next.hand.some(id => !Number.isInteger(id) || id <= 0 || id > 999999999)) throw new Error('Invalid hint');
        if (next.next && (!Number.isInteger(next.next.cardId) || typeof next.next.name !== 'string' || next.next.name.length > 200 || typeof next.next.action !== 'string' || next.next.action.length > 80 || typeof next.next.detail !== 'string' || next.next.detail.length > 20000 || typeof next.next.label !== 'string' || next.next.label.length > 20000)) throw new Error('Invalid next move');
        if (typeof next.ydke !== 'string' || next.ydke.length > 2000) throw new Error('Invalid deck context');
        hint = { active: next.active,message: next.message,hand: next.hand,ydke: next.ydke,next: next.next ?? null,updatedAt: Date.now() };
        res.writeHead(204); res.end();
      } catch { res.writeHead(400); res.end('Invalid hint'); }
      return;
    }
    if (req.method === 'GET' && req.url === '/overlay') {
      res.setHeader('Content-Type','application/json; charset=utf-8');
      if (hint.active) {
        try {
          const canonical = input => input.slice(7).split('!').slice(0,3).map(part => { const bytes = Buffer.from(part,'base64'); const ids = []; for (let i=0;i+4<=bytes.length;i+=4) ids.push(bytes.readUInt32LE(i)); return ids.sort((a,b)=>a-b).join(','); }).join('|');
          if (canonical(hint.ydke) !== canonical((await snapshot()).activeDeck.ydke)) { res.end(JSON.stringify({ active: false,message: 'Mazzo cambiato in MDPro4: aggiorna la sessione del coach.',hand: [],next: null })); return; }
        } catch { res.end(JSON.stringify({ active: false,message: 'Mazzo non verificabile: suggerimenti sospesi.',hand: [],next: null })); return; }
      }
      res.end(JSON.stringify(Date.now()-hint.updatedAt < 15000 ? hint : { active: false,message: 'Coach pronto: collega il tool locale dal sito.',hand: [],next: null })); return;
    }
    if (req.method !== 'GET' || req.url !== '/snapshot') { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type','application/json; charset=utf-8');
    try { res.end(JSON.stringify({ ...await snapshot(),live: live && Date.now()-live.observedAt < 4000 ? live : null })); }
    catch { res.writeHead(503); res.end(JSON.stringify({ error: 'Mazzo MDPro4 non leggibile. Apri un mazzo salvato e controlla il percorso del gioco.' })); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = Object.fromEntries(process.argv.slice(2).map(arg => { const at = arg.indexOf('='); return [arg.slice(0,at),arg.slice(at+1)]; }));
  const origins = coachOrigins(options['--origins']);
  const observerKey = randomBytes(32).toString('hex');
  const server = createMdproBridge({ gameRoot: options['--game'] || 'C:/Games/MDPro4',captureRoot: options['--captures'] || join(homedir(),'AppData','LocalLow','YGO','MDPro4','ComboSheets','drafts'),origins,observerKey });
  const children = [];
  server.listen(4718,'127.0.0.1',() => {
    console.log('MDPro4 coach: collegamento locale attivo su 127.0.0.1:4718. Lettura del registratore Test Hand.');
    const python = options['--python'] || fileURLToPath(new URL('./.venv/Scripts/python.exe',import.meta.url));
    for (const entry of ['observe-game.py','game-overlay.py']) {
      const child = spawn(python,[fileURLToPath(new URL(entry,import.meta.url))],{ windowsHide: true,stdio: ['pipe','inherit','inherit'],env: { ...process.env,MDPRO_OBSERVER_KEY: observerKey,MDPRO_GAME_ROOT: options['--game'] || 'C:/Games/MDPro4' } });
      child.on('error',() => console.error('Componente coach non avviato: controlla l’ambiente Python del tool.'));
      children.push(child);
    }
  });
  let closing = false;
  const stop = () => {
    if (closing) return; closing = true;
    for (const child of children) { child.stdin?.end('stop\n'); const deadline = setTimeout(() => child.kill(),3000); deadline.unref(); }
    server.close();
  };
  process.on('SIGINT',stop); process.on('SIGTERM',stop);
  server.on('error',error => { console.error(error.code === 'EADDRINUSE' ? 'Il collegamento locale è già avviato.' : 'Avvio del collegamento non riuscito.'); process.exitCode = 1; });
}
