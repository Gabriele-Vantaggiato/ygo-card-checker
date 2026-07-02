/**
 * Quick legality verification against YGOPRODeck API.
 * Run: node scripts/verify-legality.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';

const formats = JSON.parse(
  readFileSync(join(__dirname, '../src/assets/data/formats.json'), 'utf8'),
);

function loadBanlist(id) {
  return JSON.parse(
    readFileSync(join(__dirname, `../src/assets/data/banlists/${id}.json`), 'utf8'),
  );
}

async function fetchCard(name) {
  const res = await fetch(`${API}?name=${encodeURIComponent(name)}&misc=yes`);
  const json = await res.json();
  return json.data?.[0];
}

function getBanlistStatus(card, format, banlist) {
  if (format.banlistSource === 'ban_goat') {
    return card.banlist_info?.ban_goat ?? 'Unlimited';
  }
  if (format.banlistSource === 'ban_tcg') {
    return card.banlist_info?.ban_tcg ?? 'Unlimited';
  }
  if (format.banlistSource === 'local' && banlist) {
    return banlist.cards[String(card.id)] ?? 'Unlimited';
  }
  return 'Unlimited';
}

function isSpeedDuelExclusive(formats) {
  const normalized = formats.map((f) => f.toLowerCase());
  return normalized.includes('speed duel') && !normalized.includes('tcg');
}

function isRushDuelExclusive(formats) {
  const normalized = formats.map((f) => f.toLowerCase());
  return normalized.includes('rush duel') && !normalized.includes('tcg');
}

function check(card, format, banlist) {
  const tcgDate = card.misc_info?.[0]?.tcg_date ?? null;
  const formats = card.misc_info?.[0]?.formats ?? [];
  let inPool = true;
  if (!tcgDate) inPool = false;
  if (format.cardPoolEndDate && tcgDate > format.cardPoolEndDate) inPool = false;
  if (format.id !== 'tcg') {
    if (isSpeedDuelExclusive(formats)) inPool = false;
    if (isRushDuelExclusive(formats)) inPool = false;
  }
  const status = getBanlistStatus(card, format, banlist);
  const legal = inPool && status !== 'Forbidden';
  return { legal, inPool, status, tcgDate };
}

const cases = [
  { card: 'Soul Charge', format: 'hat', expectLegal: true },
  { card: 'Satellarknight Deneb', format: 'hat', expectLegal: false },
  { card: 'Fiber Jar', format: 'goat', expectLegal: false },
  { card: 'Scapegoat', format: 'goat', expectLegal: true },
  { card: 'Pot of Greed', format: 'edison', expectLegal: false },
  { card: 'Reborn Tengu', format: 'tengu', expectLegal: true },
  { card: 'Artifact Moralltach', format: 'hat', expectLegal: true },
  { card: 'Beatdown!', format: 'hat', expectLegal: false },
  { card: 'Ash Blossom & Joyous Spring', format: 'tcg', expectLegal: true },
];

let passed = 0;
for (const test of cases) {
  const format = formats.find((f) => f.id === test.format);
  const banlist = format.banlistId ? loadBanlist(format.banlistId) : null;
  const card = await fetchCard(test.card);
  const result = check(card, format, banlist);
  const ok = result.legal === test.expectLegal;
  if (ok) passed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} | ${test.card} @ ${test.format} => legal=${result.legal} (pool=${result.inPool}, ban=${result.status}, date=${result.tcgDate})`,
  );
}

console.log(`\n${passed}/${cases.length} tests passed`);
process.exit(passed === cases.length ? 0 : 1);
