import { parseDeck, sample } from './kernel.mjs';

export const examplePrompt = 'Mostra la decklist in due colonne, tema scuro, ordine alfabetico, con riepilogo.';
export const editPrompt = 'Imposta una colonna, tema chiaro, ordine per quantità.';
const command = /^(mostra la decklist|imposta) (?:in )?(una colonna|due colonne), tema (chiaro|scuro), ordine (alfabetico|per quantità)(?:, (con riepilogo|senza riepilogo))?\.?$/iu;
const sections = { main: 'Main Deck', extra: 'Extra Deck', side: 'Side Deck' };
const alphabet = new Intl.Collator('en');

export function composeDeckWorkspace(intent, deck, grants) {
  if (!grants.has('deck.read')) throw Error('Accesso alla capability deck.read negato.');
  const match = typeof intent === 'string' && command.exec(intent.trim().toLocaleLowerCase('it'));
  if (!match) throw Error('Richiesta fuori dalle capability della demo. Usa uno degli esempi.');
  const [, , columns, theme, order, summary] = match;
  const cards = parseDeck(deck);
  if (!cards.length) throw Error('Inserisci almeno una carta.');
  if (cards.some(card => card.quantity > 3)) throw Error('Massimo tre copie per carta in ogni sezione.');

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
