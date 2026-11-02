import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { coachOrigins, createMdproBridge, parseNativeDeck } from './bridge.mjs';

test('deck conversion preserves duplicate copies and sections, rejects traversal and oversized decks', () => {
  const deck = parseNativeDeck('DeckInUse->Test\r\n','#main\r\n1\r\n1\r\n2\r\n#extra\r\n9\r\n!side\r\n10\r\n');
  assert.equal(deck.name,'Test');
  assert.deepEqual(deck.ydke.slice(7).split('!').slice(0,3).map(part => {
    const bytes = Buffer.from(part,'base64');
    return Array.from({length: bytes.length/4},(_,i) => bytes.readUInt32LE(i*4));
  }),[[1,1,2],[9],[10]]);
  assert.throws(() => parseNativeDeck('DeckInUse->../private','#main\n1'));
  assert.throws(() => parseNativeDeck('DeckInUse->Test','#main\n'+'1\n'.repeat(61)));
});

test('production origin keeps the native overlay origin and rejects non-origin URLs', () => {
  assert.ok(coachOrigins('https://coach.example').includes('http://127.0.0.1:4201'));
  assert.ok(coachOrigins('https://coach.example').includes('https://coach.example'));
  assert.throws(() => coachOrigins('https://coach.example/path'));
  assert.throws(() => coachOrigins('file:///private'));
});

test('loopback bridge isolates origins, authenticates the observer and freezes the duel deck per session', async t => {
  const directory = await mkdtemp(join(tmpdir(),'mdpro-coach-test-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'mdpro-coach-test-'));
  t.after(() => rm(directory,{ recursive: true,force: true }));
  await mkdir(join(directory,'Data')); await mkdir(join(directory,'Deck'));
  const config = join(directory,'Data','config.conf');
  await writeFile(config,'DeckInUse->Test');
  await writeFile(join(directory,'Deck','Test.ydk'),'#main\n1\n2\n3\n4\n5\n#extra\n9\n!side\n10');
  const server = createMdproBridge({ gameRoot: directory,captureRoot: join(directory,'captures'),origins: coachOrigins(),observerKey: 'test-observer-key' });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path,options = {}) => fetch(base+path,{ ...options,signal: AbortSignal.timeout(5000) });
  const headers = { Origin: 'http://127.0.0.1:4201' };
  const denied = await request('/snapshot',{ headers: { Origin: 'https://other.example' } });
  assert.equal(denied.status,403); await denied.text();
  const first = await request('/snapshot',{ headers }).then(r => r.json());
  assert.equal(first.activeDeck.name,'Test');
  const sheet = { schemaVersion: 1,id: 'capture',tabs: [{ combos: [{ startingCards: [1,2,3,4,5],steps: [] }] }] };
  const payload = sessionId => JSON.stringify({ active: true,limited: false,sessionId,sheet,pid: 123 });
  const unauthenticated = await request('/native',{ method: 'POST',body: payload('one') });
  assert.equal(unauthenticated.status,403); await unauthenticated.text();
  const observe = async sessionId => {
    const response = await request('/native',{ method: 'POST',headers: { 'X-MDPro-Observer-Key': 'test-observer-key' },body: payload(sessionId) });
    assert.equal(response.status,204); await response.text();
    return request('/snapshot',{ headers }).then(r => r.json());
  };
  assert.equal((await observe('one')).live.deck.name,'Test');
  await writeFile(config,'DeckInUse->Other');
  await writeFile(join(directory,'Deck','Other.ydk'),'#main\n11\n12\n13\n14\n15\n');
  assert.equal((await observe('one')).live.deck.name,'Test');
  assert.equal((await observe('two')).live.deck.name,'Other');
});
