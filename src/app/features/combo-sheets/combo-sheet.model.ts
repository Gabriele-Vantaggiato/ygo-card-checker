export interface ComboDiagramCard {
  card: number;
  join: string;
  action: string;
  zone: string;
  caption: string;
  group?: string;
}
export interface ComboSheetStep {
  title: string;
  text: string;
  kind: string;
  cards: number[];
  flow?: ComboDiagramCard[];
}
export interface ComboSheetGuide {
  id: string;
  title: string;
  description: string;
  startingCards: number[];
  endCards: number[];
  requiredCards: number[];
  playsAround: number[];
  cardNotes?: Record<string, string>;
  startFlow?: ComboDiagramCard[];
  endFlow?: ComboDiagramCard[];
  steps: ComboSheetStep[];
}
export interface ComboSheet {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  author: string;
  accent: string;
  tags: string[];
  tabs: { id: string; title: string; combos: ComboSheetGuide[] }[];
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 20000): v is string => typeof v === 'string' && v.length <= max;
const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
const ids = (v: unknown): v is number[] => list(v, 200) && v.every(id => Number.isSafeInteger(id) && (id as number) >= 0 && (id as number) <= 999999999);
const diagram = (v: unknown): boolean => v === undefined || (list(v, 200) && v.every(c => record(c) && ids([c['card']]) && ['join', 'action', 'zone', 'caption'].every(k => text(c[k])) && (c['group'] === undefined || text(c['group']))));
const uniqueIds = (items: unknown[]): boolean => new Set(items.map(v => record(v) ? v['id'] : undefined)).size === items.length;

/** MDPro4 1.0.6 teaching sheets. Validate at every file/storage boundary. */
export function isComboSheet(v: unknown): v is ComboSheet {
  return record(v) && v['schemaVersion'] === 1 && text(v['id'], 120) && !!v['id'] &&
    text(v['title'], 200) && !!v['title'] && text(v['description']) && text(v['author'], 200) && text(v['accent'], 80) &&
    list(v['tags'], 30) && v['tags'].every(t => text(t, 100)) &&
    list(v['tabs'], 30) && v['tabs'].length > 0 && uniqueIds(v['tabs']) && v['tabs'].every(t =>
      record(t) && text(t['id'], 120) && !!t['id'] && text(t['title'], 200) &&
      list(t['combos'], 100) && uniqueIds(t['combos']) && t['combos'].every(g =>
        record(g) && text(g['id'], 120) && !!g['id'] && text(g['title'], 200) && text(g['description']) &&
        ['startingCards', 'endCards', 'requiredCards', 'playsAround'].every(k => ids(g[k])) &&
        (g['cardNotes'] === undefined || (record(g['cardNotes']) && Object.keys(g['cardNotes']).length <= 800 && Object.values(g['cardNotes']).every(n => text(n)))) &&
        diagram(g['startFlow']) && diagram(g['endFlow']) && list(g['steps'], 300) && g['steps'].every(s =>
          record(s) && text(s['title'], 200) && text(s['text']) && text(s['kind'], 80) && ids(s['cards']) && diagram(s['flow']))));
}

export function newComboGuide(): ComboSheetGuide {
  return { id: crypto.randomUUID(), title: 'Nuova linea', description: '', startingCards: [], endCards: [], requiredCards: [], playsAround: [], steps: [] };
}
export function newComboSheet(): ComboSheet {
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'La mia scheda combo', description: '', author: '', accent: 'cyan', tags: [], tabs: [{ id: crypto.randomUUID(), title: 'Starter', combos: [newComboGuide()] }] };
}
