/** Declarative, versioned workspace model. UI is data; no generated JS is executed. */
import type { SimulationOutput, SimulationCard } from './intent-simulator';

export type PanelKind = 'metrics' | 'opening-hand' | 'starter-chart' | 'frequency-chart' | 'combinations' | 'decklist';
export type WorkspaceTheme = 'duel' | 'midnight' | 'parchment';
export interface WorkspacePanel { id: string; kind: PanelKind; title: string; visible: boolean; }
export interface WorkspaceDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  deckId: string;
  deckName: string;
  createdAt: string;
  updatedAt: string;
  theme: WorkspaceTheme;
  columns: 1 | 2 | 3;
  scale: 'compact' | 'normal' | 'large';
  panels: WorkspacePanel[];
  simulation: SimulationOutput;
  /** Snapshot makes restoration deterministic, without silently changing the underlying deck. */
  cards: SimulationCard[];
  revision: number;
}

export const CAPABILITIES = [
  { id: 'deck.read', description: 'Read the selected main deck, without mutating it' },
  { id: 'hand.simulate', description: 'Seeded hand draws and frequencies' },
  { id: 'workspace.compose', description: 'Compose panels from an approved registry' },
  { id: 'workspace.persist', description: 'Save workspaces in this browser (local demo, no account isolation)' },
] as const;

export const PANEL_CATALOG: readonly { kind: PanelKind; title: string }[] = [
  { kind: 'metrics', title: 'Statistiche principali' },
  { kind: 'opening-hand', title: 'Mani di esempio' },
  { kind: 'starter-chart', title: 'Distribuzione degli starter' },
  { kind: 'frequency-chart', title: 'Probabilità di pescata' },
  { kind: 'combinations', title: 'Combinazioni osservate' },
  { kind: 'decklist', title: 'Mazzo utilizzato' },
];

export function defaultPanels(): WorkspacePanel[] {
  return PANEL_CATALOG.map((item) => ({ ...item, id: item.kind, visible: true }));
}

const aliases: Record<PanelKind, RegExp> = {
  metrics: /statistic|metric|brick|percentual/i,
  'opening-hand': /mano|mani|pescat|hand/i,
  'starter-chart': /starter|distribuzion/i,
  'frequency-chart': /grafico|grafici|frequenz|probabilit/i,
  combinations: /combinazion|combo/i,
  decklist: /decklist|mazzo|lista carte/i,
};

/** Offline interpreter for the MVP; replaceable by a validated model adapter. */
export function interpretWorkspaceRequest(request: string, current?: WorkspaceDefinition): {
  columns: 1 | 2 | 3; theme: WorkspaceTheme; scale: WorkspaceDefinition['scale']; panels: WorkspacePanel[];
  samples: number | null; isVisualEdit: boolean;
} {
  const lower = request.toLowerCase();
  const panels = current ? current.panels.map((p) => ({ ...p })) : defaultPanels();
  let columns: 1 | 2 | 3 = current?.columns ?? 2;
  let theme: WorkspaceTheme = current?.theme ?? 'duel';
  let scale: WorkspaceDefinition['scale'] = current?.scale ?? 'normal';
  if (/una colonna|1 colonn|verticale|colonna singola/.test(lower)) columns = 1;
  else if (/due colonne|2 colonn/.test(lower)) columns = 2;
  else if (/tre colonne|3 colonn/.test(lower)) columns = 3;
  if (/tema chiaro|chiaro|pergamena/.test(lower)) theme = 'parchment';
  else if (/tema notte|midnight|blu notte/.test(lower)) theme = 'midnight';
  else if (/tema scuro|scuro|dark|duel/.test(lower)) theme = 'duel';
  if (/pi[uù] grande|ingrand|scala grande/.test(lower)) scale = 'large';
  if (/compatto|riduc|pi[uù] piccolo/.test(lower)) scale = 'compact';
  if (/dimensioni normali|scala normale/.test(lower)) scale = 'normal';

  for (const panel of panels) {
    const hit = aliases[panel.kind].test(lower);
    if (!hit) continue;
    if (/nascond|rimuov|togli/.test(lower)) panel.visible = false;
    else if (/mostra|aggiung|riattiv/.test(lower)) panel.visible = true;
  }
  const front = /(?:metti|sposta|porta) (?:il |la |le |i )?(grafico|statistiche|mani|decklist|combo|starter).*?(?:prima|inizio|alto)/.exec(lower);
  if (front) {
    const token = front[1]!;
    const match = panels.find((p) => aliases[p.kind].test(token));
    if (match) { panels.splice(panels.indexOf(match), 1); panels.unshift(match); }
  }
  const countMatch = /(?:simula|esegui|fai|con)\s+([\d. ]{3,12})\s*(?:mani|simulazioni|pescate)/.exec(lower)
    ?? /([\d. ]{3,12})\s*(?:mani|simulazioni|pescate)/.exec(lower);
  const count = countMatch ? Number(countMatch[1]!.replace(/[. ]/g, '')) : null;
  const samples = count !== null && Number.isFinite(count) && count > 0 && count <= 100_000 ? count : null;
  return { columns, theme, scale, panels, samples, isVisualEdit: current !== undefined };
}

export function validWorkspace(value: unknown): value is WorkspaceDefinition {
  if (!value || typeof value !== 'object') return false;
  const w = value as Partial<WorkspaceDefinition>;
  const sim = w.simulation;
  return w.schemaVersion === 1 && typeof w.id === 'string' && typeof w.deckId === 'string'
    && typeof w.name === 'string' && typeof w.deckName === 'string'
    && typeof w.createdAt === 'string' && typeof w.updatedAt === 'string'
    && typeof w.revision === 'number' && Number.isInteger(w.revision)
    && Array.isArray(w.cards) && w.cards.length <= 100
    && w.cards.every((c) => !!c && Number.isSafeInteger(c.id)
      && typeof c.name === 'string' && Number.isInteger(c.quantity)
      && c.quantity > 0 && c.quantity <= 3)
    && !!sim && Number.isInteger(sim.seed) && Number.isInteger(sim.samples)
    && sim.samples >= 1 && sim.samples <= 100_000
    && Number.isInteger(sim.handSize) && sim.handSize >= 1 && sim.handSize <= 6
    && Number.isInteger(sim.deckSize) && typeof sim.deckFingerprint === 'string'
    && (sim.brickRate === null || (typeof sim.brickRate === 'number' && sim.brickRate >= 0 && sim.brickRate <= 1))
    && Array.isArray(sim.starterIds) && Array.isArray(sim.starterDistribution)
    && Array.isArray(sim.appearances) && Array.isArray(sim.mostCommonHands)
    && Array.isArray(sim.exampleHands)
    && Array.isArray(w.panels) && w.panels.length <= PANEL_CATALOG.length
    && w.panels.every((p) => !!p && PANEL_CATALOG.some((item) => item.kind === p.kind)
      && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.visible === 'boolean')
    && [1, 2, 3].includes(w.columns ?? 0)
    && ['duel', 'midnight', 'parchment'].includes(w.theme ?? '')
    && ['compact', 'normal', 'large'].includes(w.scale ?? '');
}
