/**
 * Compact per-card metadata for the cards that appear in the deck-roulette pool:
 * functional roles and flags (from knowledge tags), facts for Extra Deck reachability, plus the
 * synergy links between pool cards and per-format card usage in tournament decks.
 *
 * Card entry: [roleMask, kind, level, tuner, flagMask, archetypeIndex]   (see src/app/utils/card-meta.utils.ts)
 *   archetypeIndex points into the `archetypes` name list of cards.json (0 = no archetype)
 * Link entry: [targetId, relationCode, score]            (see RELATION_CODES)
 */

export const ROLE_BITS = { starter: 1, extender: 2, handtrap: 4, interaction: 8, removal: 16, draw: 32 };
export const KIND_CODES = { other: 0, monster: 1, spell: 2, trap: 3, fusion: 4, synchro: 5, xyz: 6, link: 7 };

/** Finer functional flags used by the brick-rate and synergy models. */
export const FLAG_BITS = {
  search: 1,
  ssDeck: 2,
  ssHand: 4,
  ssGy: 8,
  gyFill: 16,
  gyUse: 32,
  quick: 64,
  trigger: 128,
  continuous: 256,
  negate: 512,
  removal: 1024,
  draw: 2048,
  handtrap: 4096,
  normalSummonable: 8192,
  ritualMonster: 16384,
  ritualSpell: 32768,
};

export const RELATION_CODES = { gy: 1, engine: 2, search: 3, mention: 4, shared: 5, archetype: 6, series: 7 };
const RELATION_BY_NAME = {
  gy_synergy: RELATION_CODES.gy,
  engine: RELATION_CODES.engine,
  search_target: RELATION_CODES.search,
  mentions_card: RELATION_CODES.mention,
  shared_mention: RELATION_CODES.shared,
  archetype: RELATION_CODES.archetype,
  series: RELATION_CODES.series,
};

function rolesFromTags(tags) {
  const has = (...names) => names.some((n) => tags.has(n));
  let mask = 0;
  if (has('searches_deck', 'searches_monster', 'searches_spell', 'searches_trap', 'ss_from_deck')) mask |= ROLE_BITS.starter;
  if (has('ss_from_hand', 'ss_from_gy', 'revives_from_gy')) mask |= ROLE_BITS.extender;
  if (has('hand_trap')) mask |= ROLE_BITS.handtrap;
  if (has('negates', 'category_negate')) mask |= ROLE_BITS.interaction;
  if (has('destroys', 'banishes', 'bounce_to_hand', 'category_destroy', 'category_banish', 'category_return_to_hand')) mask |= ROLE_BITS.removal;
  if (has('draw', 'category_draw')) mask |= ROLE_BITS.draw;
  return mask;
}

function flagsFromCard(tags, card, kind, level) {
  const has = (...names) => names.some((n) => tags.has(n));
  let mask = 0;
  if (has('searches_deck', 'searches_monster', 'searches_spell', 'searches_trap')) mask |= FLAG_BITS.search;
  if (has('ss_from_deck')) mask |= FLAG_BITS.ssDeck;
  if (has('ss_from_hand')) mask |= FLAG_BITS.ssHand;
  if (has('ss_from_gy', 'revives_from_gy')) mask |= FLAG_BITS.ssGy;
  if (has('sends_to_gy', 'mills', 'discards', 'hand_to_gy', 'self_to_gy', 'category_send_to_gy')) mask |= FLAG_BITS.gyFill;
  if (has('gy_effect', 'gy_interaction')) mask |= FLAG_BITS.gyUse;
  if (has('quick_effect')) mask |= FLAG_BITS.quick;
  if (has('trigger_effect')) mask |= FLAG_BITS.trigger;
  if (/Continuous/i.test(card.race ?? '') || /Continuous/i.test(card.type ?? '')) mask |= FLAG_BITS.continuous;
  if (has('negates', 'category_negate')) mask |= FLAG_BITS.negate;
  if (has('destroys', 'banishes', 'bounce_to_hand', 'category_destroy', 'category_banish', 'category_return_to_hand')) mask |= FLAG_BITS.removal;
  if (has('draw', 'category_draw')) mask |= FLAG_BITS.draw;
  if (has('hand_trap')) mask |= FLAG_BITS.handtrap;
  if (kind === KIND_CODES.monster && level > 0 && level <= 4) mask |= FLAG_BITS.normalSummonable;
  if (/Ritual/i.test(card.type ?? '') && /Monster/i.test(card.type ?? '')) mask |= FLAG_BITS.ritualMonster;
  if (/Spell/i.test(card.type ?? '') && /Ritual/i.test(card.race ?? '')) mask |= FLAG_BITS.ritualSpell;
  return mask;
}

function kindOf(type = '') {
  if (/Link/.test(type)) return KIND_CODES.link;
  if (/XYZ|Xyz/.test(type)) return KIND_CODES.xyz;
  if (/Synchro/.test(type)) return KIND_CODES.synchro;
  if (/Fusion/.test(type)) return KIND_CODES.fusion;
  if (/Spell/.test(type)) return KIND_CODES.spell;
  if (/Trap/.test(type)) return KIND_CODES.trap;
  if (/Monster/.test(type)) return KIND_CODES.monster;
  return KIND_CODES.other;
}

/** `related` = related.json entries, `catalog` = Map(id -> catalog card). Returns the cards and the archetype name list. */
export function buildCardMeta(ids, related, catalog) {
  const out = {};
  const archetypes = [''];
  const archetypeIndex = new Map();
  for (const id of ids) {
    const card = catalog.get(String(id));
    if (!card) continue;
    const entry = related[String(id)];
    const tags = new Set(entry?.tags ?? []);
    const level = card.level ?? entry?.level ?? 0;
    const kind = kindOf(card.type);
    const archetype = card.archetype ?? '';
    if (archetype && !archetypeIndex.has(archetype)) {
      archetypeIndex.set(archetype, archetypes.length);
      archetypes.push(archetype);
    }
    out[id] = [
      rolesFromTags(tags),
      kind,
      level,
      /Tuner/.test(card.type) ? 1 : 0,
      flagsFromCard(tags, { ...card, race: card.race ?? entry?.race }, kind, level),
      archetype ? archetypeIndex.get(archetype) : 0,
    ];
  }
  return { cards: out, archetypes };
}

/** Typed synergy links between pool cards: id -> [[targetId, relationCode, score], ...], strongest first. */
export function buildSynergyLinks(ids, related, perCardLimit = 24) {
  const pool = new Set(ids.map(Number));
  const links = {};
  for (const id of pool) {
    const entries = related[String(id)]?.related ?? [];
    const row = [];
    for (const rel of entries) {
      const code = RELATION_BY_NAME[rel.relation];
      if (!code || !pool.has(rel.id) || rel.id === id) continue;
      row.push([rel.id, code, Math.round((rel.score ?? 0) * 100) / 100]);
    }
    row.sort((a, b) => b[2] - a[2]);
    if (row.length > 0) links[id] = row.slice(0, perCardLimit);
  }
  return links;
}

/**
 * Share of competitive decks that play each card, in [0,1]. Tournament decks only; placement and
 * recency weight the vote so cards from winning, recent lists count more.
 */
export function buildUsage(decks, now = Date.now()) {
  const weights = new Map();
  let total = 0;
  for (const deck of decks) {
    if (deck.source !== 'tournament') continue;
    const placement = deck.placement ?? 8;
    const placementWeight = placement <= 1 ? 1.6 : placement <= 2 ? 1.35 : placement <= 4 ? 1.15 : 1;
    const ageYears = deck.eventDate ? Math.max(0, (now - Date.parse(deck.eventDate)) / (365.25 * 24 * 3600 * 1000)) : 3;
    const recency = Math.max(0.5, 1 - ageYears * 0.08);
    const weight = placementWeight * recency;
    total += weight;
    for (const id of new Set([...deck.main, ...deck.extra])) weights.set(id, (weights.get(id) ?? 0) + weight);
  }
  const usage = {};
  if (total === 0) return usage;
  for (const [id, w] of weights) usage[id] = Math.round((w / total) * 1000) / 1000;
  return usage;
}
