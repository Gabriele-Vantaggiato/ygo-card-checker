import { readFileSync } from 'node:fs';
import { catalogCard, parseDeck, probability, sample } from './kernel.mjs';

export const examplePrompt = 'Mostra la decklist in due colonne, tema scuro, ordine alfabetico, con riepilogo.';
export const editPrompt = 'Imposta una colonna, tema chiaro, ordine per quantità.';
export const dashboardPrompt = 'Componi la dashboard con la decklist con immagini a sinistra, brick rate e consistency a destra e carte in sinergia sotto.';
const dashboardCommand = /^(?:componi|crea|mostra) (?:la |una )?dashboard con (?:la )?decklist con immagini a sinistra brick rate e consistency a destra e carte in sinergia sotto$/u;
const command = /^(mostra la decklist|imposta) (?:in )?(una colonna|due colonne), tema (chiaro|scuro), ordine (alfabetico|per quantità)(?:, (con riepilogo|senza riepilogo))?\.?$/iu;
const sections = { main: 'Main Deck', extra: 'Extra Deck', side: 'Side Deck' };
const alphabet = new Intl.Collator('en');
let cooccurrence;

function suggestions(cards) {
  cooccurrence ??= JSON.parse(readFileSync(new URL('../../src/assets/data/deck-builder/cooccurrence.json', import.meta.url)));
  const deckIds = new Set(cards.map(card => card.id));
  const best = new Map();
  for (const card of cards) {
    for (const partner of cooccurrence[card.id] ?? []) {
      if (deckIds.has(partner.id) || partner.weight <= (best.get(partner.id)?.weight ?? 0)) continue;
      const match = catalogCard(partner.id);
      if (match) best.set(partner.id, { id: match.i, name: match.n, partner: card.name, weight: partner.weight });
    }
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight || alphabet.compare(a.name, b.name)).slice(0, 8);
}

function composeDashboard(cards, deck, grants, options) {
  for (const capability of ['hand.analyze', 'deck.suggest']) {
    if (!grants.has(capability)) throw Error(`Accesso alla capability ${capability} negato.`);
  }
  const main = cards.filter(card => card.section === 'main');
  const size = main.reduce((total, card) => total + card.quantity, 0);
  const hand = options.hand ?? 5;
  if (![5, 6].includes(hand)) throw Error('Scegli una mano da 5 o 6 carte.');
  if (typeof (options.starters ?? '') !== 'string') throw Error('I nomi delle carte chiave devono essere testo.');
  const names = (options.starters ?? '').split(/[\n,]/u).map(name => name.trim().toLowerCase()).filter(Boolean);
  const starters = main.filter(card => names.includes(card.name.toLowerCase()));
  if (names.some(name => !starters.some(card => card.name.toLowerCase() === name))) {
    throw Error('Le carte chiave indicate devono comparire nel Main Deck.');
  }
  const count = starters.reduce((total, card) => total + card.quantity, 0);
  const hit = count && size >= hand ? probability(size, count, hand) : null;
  const format = new Intl.NumberFormat('it', { style: 'percent', maximumFractionDigits: 2 });
  const analysis = hit === null
    ? { type: 'notice', title: 'Brick rate e consistency', note: size < hand ? 'Il Main Deck è più piccolo della mano scelta.' : 'Indica le carte chiave del Main Deck per calcolare le probabilità.' }
    : { type: 'metrics', title: 'Brick rate e consistency', note: `Mano da ${hand} senza reinserimento. ${count} copie su ${size} carte. Carte chiave: ${starters.map(card => card.name).join(', ')}.`, items: [
      { label: 'Brick rate · zero carte chiave', value: format.format(1 - hit) },
      { label: 'Consistency · almeno una carta chiave', value: format.format(hit) }
    ] };
  return {
    version: 1,
    capability: 'deck.read',
    title: deck === sample ? 'Dashboard · decklist di esempio' : 'Dashboard · la tua decklist',
    layout: { columns: 2, theme: 'dark', variant: 'dashboard' },
    blocks: [
      { type: 'cards', slot: 'deck', title: 'Decklist', groups: Object.entries(sections).map(([id, title]) => ({
        title, cards: cards.filter(card => card.section === id)
      })).filter(group => group.cards.length) },
      { ...analysis, slot: 'analysis' },
      { type: 'cards', slot: 'full', title: 'Carte da valutare', note: 'Carte trovate insieme a quelle del mazzo nelle liste indicizzate da YGOCC. La co-occorrenza non verifica combo o legalità.', groups: [{cards: suggestions(cards)}] }
    ]
  };
}

export function composeDeckWorkspace(intent, deck, grants, options = {}) {
  if (!grants.has('deck.read')) throw Error('Accesso alla capability deck.read negato.');
  const prompt = typeof intent === 'string' ? intent.trim().toLocaleLowerCase('it') : '';
  const dashboard = dashboardCommand.test(prompt.replace(/[,.]/gu, '').replace(/\s+/gu, ' '));
  const match = command.exec(prompt);
  if (!match && !dashboard) throw Error('Richiesta fuori dalle capability della demo. Usa uno degli esempi.');
  const cards = parseDeck(deck);
  if (!cards.length) throw Error('Inserisci almeno una carta.');
  if (cards.some(card => card.quantity > 3)) throw Error('Massimo tre copie per carta in ogni sezione.');
  if (dashboard) return composeDashboard(cards, deck, grants, options);
  const [, , columns, theme, order, summary] = match;

  const blocks = [];
  const counts = Object.entries(sections).map(([id, label]) => ({
    label,
    value: cards.filter(card => card.section === id).reduce((total, card) => total + card.quantity, 0)
  }));
  if (summary !== 'senza riepilogo') blocks.push({ type: 'metrics', title: 'Riepilogo', items: counts });
  for (const [id, title] of Object.entries(sections)) {
    const rows = cards.filter(card => card.section === id).sort((a, b) => {
      const byName = alphabet.compare(a.name, b.name);
      return order === 'alfabetico' ? byName : b.quantity - a.quantity || byName;
    });
    if (rows.length) blocks.push({
      type: 'table',
      title,
      columns: ['Carta', 'Copie'],
      rows: rows.map(card => [card.name, card.quantity])
    });
  }
  return {
    version: 1,
    capability: 'deck.read',
    title: deck === sample ? 'Decklist di esempio' : 'La tua decklist',
    layout: { columns: columns === 'due colonne' ? 2 : 1, theme: theme === 'chiaro' ? 'light' : 'dark' },
    blocks
  };
}
