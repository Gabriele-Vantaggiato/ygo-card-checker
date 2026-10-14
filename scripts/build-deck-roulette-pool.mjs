/**
 * Builds the curated deck pool used by the "Deck Roulette" feature.
 * The pool is static data: real, hand-built decks (YGOPRODeck + Format Library) that are
 * re-validated against our own per-format rules, so every drawn deck is coherent AND legal:
 *   1. every card is in the format's card pool, 2. banlist copies are respected,
 *   3. no mechanic that did not exist in the format (e.g. Pendulum in HAT).
 *
 * Run: node scripts/build-deck-roulette-pool.mjs [formatId ...]   (default: all formats)
 * Output: src/assets/data/deck-roulette/<formatId>.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { enrichDeck } from './lib/deck-roulette-enrich.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '../src/assets/data');
const OUT_DIR = join(DATA, 'deck-roulette');
const YGOPRODECK_API = 'https://ygoprodeck.com/api/decks/getDecks.php';
const FORMAT_LIBRARY_API = 'https://formatlibrary.com/api';
const CARD_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const UA = { 'User-Agent': 'Mozilla/5.0 (ygo-card-checker pool builder)' };
const PAGE_SIZE = 20;
const MAX_PAGES = 15;
const MAX_PER_FORMAT = 150;
const FL_MAX_EVENTS = 80;
const FL_TOP_DECKS_PER_EVENT = 8;
/** Formats we optimise for competitive play: bigger pool, only sizeable events, placement kept for usage weights. */
const COMPETITIVE_FORMATS = {
  hat: { maxPerFormat: 400, maxEvents: 120, minEventSize: 16 },
  edison: { maxPerFormat: 400, maxEvents: 120, minEventSize: 16 },
};

/**
 * Mechanics that did not exist yet in each format. Must mirror FORMAT_BANNED_MECHANICS in
 * src/app/services/deck-roulette.service.ts (the runtime guard).
 */
const BANNED_MECHANICS = {
  goat: ['synchro', 'xyz', 'pendulum', 'link'],
  edison: ['xyz', 'pendulum', 'link'],
  tengu: ['pendulum', 'link'],
  hat: ['pendulum', 'link'],
  tcg: [],
};

/** Format Library slugs; ygoprodeck categories feed the formats it has native decks for. */
const FORMATS = {
  goat: { fl: 'goat', categories: ['GOAT Format'], banlist: 'goat' },
  edison: { fl: 'edison', categories: ['Edison Format'], banlist: { local: 'edison-2010-03' } },
  tengu: { fl: 'tengu', categories: ['Non-Meta Decks'], banlist: { local: 'tengu-2011-09' } },
  hat: { fl: 'hat', categories: ['Non-Meta Decks', 'Meta Decks'], banlist: { local: 'hat-2014-04' } },
  tcg: { fl: null, categories: ['Tournament Meta Decks', 'Meta Decks'], banlist: 'tcg' },
};

const playable = JSON.parse(readFileSync(join(DATA, 'card-knowledge/format-legality.json'), 'utf8')).playable;
const catalog = new Map(
  JSON.parse(readFileSync(join(DATA, 'deck-builder/catalog.json'), 'utf8')).map((c) => [String(c.id), c]),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOk(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return res;
    } catch {
      // retry
    }
    await sleep(1500 * (attempt + 1));
  }
  return null;
}

async function getJson(url) {
  const res = await fetchOk(url);
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function loadApiBanlist(kind) {
  const json = await getJson(`${CARD_API}?banlist=${kind}`);
  const map = new Map();
  for (const card of json?.data ?? []) {
    const status = card.banlist_info?.[kind === 'goat' ? 'ban_goat' : 'ban_tcg'];
    if (status) map.set(String(card.id), status);
  }
  return map;
}

function loadLocalBanlist(id) {
  const snap = JSON.parse(readFileSync(join(DATA, 'banlists', `${id}.json`), 'utf8'));
  return new Map(Object.entries(snap.cards));
}

function maxCopies(status) {
  return status === 'Forbidden' ? 0 : status === 'Limited' ? 1 : status === 'Semi-Limited' ? 2 : 3;
}

function countBy(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function mechanicOf(type = '') {
  if (/Pendulum/i.test(type)) return 'pendulum';
  if (/Link/i.test(type)) return 'link';
  if (/XYZ|Xyz/.test(type)) return 'xyz';
  if (/Synchro/i.test(type)) return 'synchro';
  return null;
}

function mechanicsIn(ids) {
  const found = new Set();
  for (const id of ids) {
    const mechanic = mechanicOf(catalog.get(id)?.type);
    if (mechanic) found.add(mechanic);
  }
  return [...found].sort();
}

/** Returns null when the deck is fully legal, otherwise the first reason it is not. */
function illegalReason(formatId, banlist, main, extra, side) {
  if (main.length < 40 || main.length > 60) return 'main-size';
  if (extra.length > 15) return 'extra-size';
  if (side.length > 15) return 'side-size';
  const all = countBy([...main, ...extra, ...side]);
  for (const [id, qty] of all) {
    if (!(playable[id] ?? []).includes(formatId)) return `pool:${id}`;
    if (qty > maxCopies(banlist.get(id))) return `banlist:${id}`;
    if (!catalog.has(id)) return `unknown:${id}`;
  }
  const banned = BANNED_MECHANICS[formatId] ?? [];
  const used = mechanicsIn(all.keys());
  const clash = used.find((m) => banned.includes(m));
  return clash ? `mechanic:${clash}` : null;
}

function guessCover(main, extra) {
  const pick = (ids) => {
    const counts = countBy(ids);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const monsters = main.filter((id) => /Monster/.test(catalog.get(id)?.type ?? ''));
  return Number(pick(extra) ?? pick(monsters) ?? pick(main)) || null;
}

async function ygoprodeckCandidates(categories) {
  const seen = new Map();
  for (const category of categories) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${YGOPRODECK_API}?&_sft_category=${encodeURIComponent(category)}&sort=Rating&offset=${page * PAGE_SIZE}`;
      const decks = await getJson(url);
      if (!Array.isArray(decks) || decks.length === 0) break;
      for (const deck of decks) seen.set(deck.deckNum, deck);
      await sleep(400);
    }
  }
  const out = [];
  for (const deck of seen.values()) {
    try {
      out.push({
        id: `ygoprodeck-${deck.deckNum}`,
        name: deck.deck_name,
        source: deck.tournamentPlacement && deck.tournamentPlacement !== 'None' ? 'tournament' : 'community',
        coverCardId: Number(deck.cover_card) || null,
        url: `https://ygoprodeck.com/deck/${deck.pretty_url}`,
        main: JSON.parse(deck.main_deck).map(String),
        extra: JSON.parse(deck.extra_deck ?? '[]').map(String),
        side: JSON.parse(deck.side_deck ?? '[]').map(String),
      });
    } catch {
      // malformed deck json: skip
    }
  }
  return out;
}

function parseYdk(text) {
  const sections = { main: [], extra: [], side: [] };
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '#main') current = 'main';
    else if (line === '#extra') current = 'extra';
    else if (line === '!side') current = 'side';
    else if (current && /^\d+$/.test(line)) sections[current].push(String(Number(line)));
  }
  return sections;
}

/** Tournament top-cut decks from Format Library (newest events first). */
async function formatLibraryCandidates(slug, competitive) {
  if (!slug) return [];
  const gallery = await getJson(`${FORMAT_LIBRARY_API}/events/gallery/${slug}`);
  const maxEvents = competitive?.maxEvents ?? FL_MAX_EVENTS;
  const events = (gallery?.events ?? [])
    .filter((event) => !competitive || (event.size ?? 0) >= competitive.minEventSize)
    .slice(0, maxEvents);
  const out = [];
  for (const event of events) {
    const detail = await getJson(`${FORMAT_LIBRARY_API}/events/${event.abbreviation}`);
    await sleep(300);
    const tops = (detail?.topDecks ?? []).slice(0, FL_TOP_DECKS_PER_EVENT);
    for (const top of tops) {
      const res = await fetchOk(`${FORMAT_LIBRARY_API}/decks/download/${top.id}`);
      await sleep(300);
      if (!res) continue;
      const { main, extra, side } = parseYdk(await res.text());
      if (main.length === 0) continue;
      out.push({
        id: `formatlibrary-${top.id}`,
        name: `${top.deckTypeName ?? 'Deck'} — ${event.name}`,
        source: 'tournament',
        placement: top.placement ?? null,
        eventDate: (event.endDate ?? event.startedAt ?? '').slice(0, 10) || null,
        eventSize: event.size ?? null,
        coverCardId: guessCover(main, extra),
        url: `https://formatlibrary.com/decks/${top.id}`,
        main,
        extra,
        side,
      });
    }
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });

const apiBanlists = {};
const only = process.argv.slice(2);
for (const [formatId, cfg] of Object.entries(FORMATS)) {
  if (only.length > 0 && !only.includes(formatId)) continue;
  let banlist;
  if (typeof cfg.banlist === 'string') {
    apiBanlists[cfg.banlist] ??= await loadApiBanlist(cfg.banlist);
    banlist = apiBanlists[cfg.banlist];
  } else {
    banlist = loadLocalBanlist(cfg.banlist.local);
  }

  const competitive = COMPETITIVE_FORMATS[formatId];
  const raw = [...(await formatLibraryCandidates(cfg.fl, competitive)), ...(await ygoprodeckCandidates(cfg.categories))];
  const kept = [];
  const seenLists = new Set();
  const rejected = {};
  for (const deck of raw) {
    const reason = illegalReason(formatId, banlist, deck.main, deck.extra, deck.side);
    if (reason) {
      const key = reason.split(':')[0] === 'mechanic' ? reason : reason.split(':')[0];
      rejected[key] = (rejected[key] ?? 0) + 1;
      continue;
    }
    const signature = [...deck.main].sort().join(',') + '|' + [...deck.extra].sort().join(',');
    if (seenLists.has(signature)) continue;
    seenLists.add(signature);
    kept.push({
      ...enrichDeck(deck, catalog),
      mechanics: mechanicsIn([...deck.main, ...deck.extra, ...deck.side]),
      main: deck.main.map(Number),
      extra: deck.extra.map(Number),
      side: deck.side.map(Number),
    });
  }

  const decks = kept.slice(0, competitive?.maxPerFormat ?? MAX_PER_FORMAT);
  writeFileSync(
    join(OUT_DIR, `${formatId}.json`),
    JSON.stringify({ version: 3, formatId, generatedAt: new Date().toISOString(), decks }),
  );
  const bySource = decks.reduce((acc, d) => ({ ...acc, [d.id.split('-')[0]]: (acc[d.id.split('-')[0]] ?? 0) + 1 }), {});
  console.log(`${formatId}: ${raw.length} candidates -> ${decks.length} kept`, bySource, rejected);
}
