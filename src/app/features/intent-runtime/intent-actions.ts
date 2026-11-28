import type { AdvancedCardSearchFilters } from '../../models/card-search-filters.model';

export type IntentAction =
  | { kind: 'search'; query: string; filters: AdvancedCardSearchFilters }
  | { kind: 'decks'; action: 'list' | 'create' | 'check' }
  | { kind: 'deck'; action: 'edit' | 'import' | 'export' | 'import-ydke' | 'export-ydke' | 'analysis' }
  | { kind: 'combo'; view: 'sheets' | 'flow' }
  | { kind: 'deck-analysis' }
  | { kind: 'workspace' };

export const INTENT_EXAMPLES = [
  { label: 'Ricerca carte', request: 'Cerca carte tipo:magia archetipo:"Sky Striker"' },
  { label: 'Modifica mazzo', request: 'Apri il mazzo selezionato' },
  { label: 'Importa decklist', request: 'Importa decklist' },
  { label: 'Esporta decklist', request: 'Esporta decklist' },
  { label: 'Verifica mazzo', request: 'Verifica legalità del mazzo' },
  { label: 'Schede combo', request: 'Apri schede combo del mazzo' },
  { label: 'Analisi mazzo', request: 'Analizza il mazzo' },
  { label: 'Flow Studio', request: 'Apri Flow Studio' },
  { label: 'Brick e starter', request: 'Simula 10.000 mani da 5 carte e mostra brick e starter' },
] as const;

const textFields = {
  tipo: 'type', razza: 'race', attributo: 'attribute', archetipo: 'archetype', categoria: 'categoryTag',
} as const;
const rangeFields = {
  livello: ['levelMin', 'levelMax'], atk: ['atkMin', 'atkMax'], def: ['defMin', 'defMax'],
} as const;
const cardTypes: Record<string, string> = {
  magia: 'Spell Card', trappola: 'Trap Card', fusione: 'Fusion Monster',
  synchro: 'Synchro Monster', xyz: 'XYZ Monster', link: 'Link Monster', rituale: 'Ritual Monster',
};
const attributes: Record<string, string> = {
  luce: 'LIGHT', oscurita: 'DARK', terra: 'EARTH', acqua: 'WATER', fuoco: 'FIRE',
  vento: 'WIND', divino: 'DIVINE',
};

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function searchAction(query: string): IntentAction {
  const filters: AdvancedCardSearchFilters = {};
  const value = query.replace(/\b([a-z]+):(?:"([^"]+)"|([^\s"]+))/gi, (_whole, key, quoted, plain) => {
    const field = fold(key);
    const entry = (quoted ?? plain).trim();
    if (!entry || entry.length > 120) throw Error('Valore del filtro non valido.');
    if (Object.hasOwn(textFields, field)) {
      const target = textFields[field as keyof typeof textFields];
      filters[target] = field === 'tipo' ? cardTypes[fold(entry)] ?? entry
        : field === 'attributo' ? attributes[fold(entry)] ?? entry : entry;
      return '';
    }
    if (Object.hasOwn(rangeFields, field)) {
      const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(entry);
      if (!match) throw Error('Usa un numero o un intervallo, per esempio livello:4-6.');
      const [min, max] = rangeFields[field as keyof typeof rangeFields];
      filters[min] = Number(match[1]);
      filters[max] = Number(match[2] ?? match[1]);
      return '';
    }
    throw Error('Filtro sconosciuto. Usa tipo, razza, attributo, archetipo, categoria, livello, atk o def.');
  }).replace(/\s+/g, ' ').trim();
  let name = value.replace(/^carte(?:\s+|$)/i, '');
  const quotedName = /^"([^"]+)"$/.exec(name);
  if (quotedName) name = quotedName[1].trim();
  else if (/\w+:|"/.test(name)) throw Error('Controlla il filtro. Racchiudi i valori con spazi tra virgolette.');
  const category = /^(magie|trappole)(?:\s+|$)/i.exec(name);
  if (category && !filters.type) {
    filters.type = category[1].toLowerCase() === 'magie' ? 'Spell Card' : 'Trap Card';
    name = name.slice(category[0].length);
  }
  if (!name && !Object.keys(filters).length) throw Error('Indica il nome di una carta o almeno un filtro.');
  return { kind: 'search', query: name, filters };
}

export function interpretIntentAction(input: string): IntentAction {
  const request = input.trim();
  const search = /^(?:cerca|ricerca)(?:\s+|$)/i.exec(request);
  if (search) return searchAction(request.slice(search[0].length));

  const command = fold(request).replace(/[.!?]+$/, '');
  if (/^(?:apri |mostra )?(?:ygo )?flow(?: studio)?$/.test(command)) return { kind: 'combo', view: 'flow' };
  if (/^(?:apri |mostra )?(?:schede? )?combo(?: del mazzo)?$/.test(command)) return { kind: 'combo', view: 'sheets' };
  if (/^(?:apri |mostra |elenca )?(?:le )?(?:decklist|i mazzi|mazzi)$/.test(command)) return { kind: 'decks', action: 'list' };
  if (/^(?:crea|nuovo)\b.*\b(?:mazzo|decklist)\b|^nuovo mazzo$/.test(command)) return { kind: 'decks', action: 'create' };
  if (/^(?:verifica|controlla)\b.*\b(?:legalita|mazzo|decklist)\b/.test(command)) return { kind: 'decks', action: 'check' };
  if (/^importa\b.*\b(?:mazzo|decklist|ydke)\b/.test(command)) return { kind: 'deck', action: /\bydke\b/.test(command) ? 'import-ydke' : 'import' };
  if (/^esporta\b.*\b(?:mazzo|decklist|ydke)\b/.test(command)) return { kind: 'deck', action: /\bydke\b/.test(command) ? 'export-ydke' : 'export' };
  if (/^analizza (?:il |la )?(?:mazzo|decklist)$/.test(command)) return { kind: 'deck-analysis' };
  if (/^apri (?:l['’])?analisi (?:del )?mazzo$/.test(command)) return { kind: 'deck', action: 'analysis' };
  if (/^(?:apri|modifica) (?:il |la )?(?:mazzo|decklist)(?: selezionat[oa])?$/.test(command)) return { kind: 'deck', action: 'edit' };
  if (/\b(?:simul\w*|man[oi]|pescat\w*|brick\w*|starter|tema|colonn\w*|grafici?|frequenz\w*|combinazion\w*|statistich\w*|scrivania|ambiente|probabilit\w*)\b/.test(command)) return { kind: 'workspace' };
  throw Error('Richiesta non riconosciuta. Scegli un esempio per vedere i comandi disponibili.');
}
