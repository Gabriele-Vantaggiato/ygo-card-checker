import {
  CardRoleTag,
  FlowCanvasState,
  FlowCard,
  HypergeoResult,
} from '../../../models/ygo-flow.model';
import { hypergeometricAtLeastOne, hypergeometricBothClasses } from '../../../utils/hypergeo.utils';

/** Deterministic Fisher–Yates; no mutation and no dependence on card instance IDs. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  const random = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function isInteraction(role: CardRoleTag): boolean {
  return role === 'handtrap' || role === 'interaction';
}

/** Exact access probabilities for mutually exclusive, user-editable roles. */
export function openingProfile(main: readonly FlowCard[], draws: number): HypergeoResult | null {
  if (main.length < draws || draws <= 0) return null;
  const starters = main.filter((c) => c.role === 'starter').length;
  const extenders = main.filter((c) => c.role === 'extender').length;
  const handtraps = main.filter((c) => isInteraction(c.role)).length;
  const pAtLeastOneStarter = hypergeometricAtLeastOne(main.length, starters, draws);
  return {
    deckSize: main.length,
    starters,
    extenders,
    handtraps,
    pAtLeastOneStarter,
    // Retain the legacy property for file/API compatibility. This is NOT unplayability.
    pBrick: 1 - pAtLeastOneStarter,
    pStarterPlusExtenderOrTrap: hypergeometricBothClasses(
      main.length,
      starters,
      extenders + handtraps,
      draws,
    ),
  };
}

export interface HandSample {
  total: number;
  starters: number;
  control: number;
  unclassified: number;
  examples: { seed: string; hand: FlowCard[] }[];
}

export function sampleHands(
  main: readonly FlowCard[],
  draws: number,
  seed: string,
  count = 100,
): HandSample {
  const result: HandSample = { total: 0, starters: 0, control: 0, unclassified: 0, examples: [] };
  if (main.length < draws || draws <= 0) return result;
  const pool = [...main].sort((a, b) => a.passcode - b.passcode);
  for (let i = 0; i < Math.max(0, Math.min(1000, Math.floor(count))); i++) {
    const handSeed = `${seed}:${i}`;
    const hand = seededShuffle(pool, handSeed).slice(0, draws);
    result.total++;
    if (hand.some((c) => c.role === 'starter')) result.starters++;
    else {
      if (hand.some((c) => isInteraction(c.role))) result.control++;
      else result.unclassified++;
      if (result.examples.length < 4) result.examples.push({ seed: handSeed, hand });
    }
  }
  return result;
}

export const flowRoots = (canvas: FlowCanvasState) => {
  const targets = new Set(canvas.edges.map((e) => e.to));
  return canvas.nodes.filter((n) => !targets.has(n.id));
};

export const nextFlowNodes = (canvas: FlowCanvasState, id: string) =>
  canvas.edges
    .filter((e) => e.from === id)
    .flatMap((e) => {
      const node = canvas.nodes.find((n) => n.id === e.to);
      return node ? [{ node, label: e.label || node.name }] : [];
    });

export type FlowTemplateId = 'opening' | 'recovery' | 'second' | 'grind';

/** Editable study prompts, never represented as validated card-effect sequences. */
export function flowTemplate(id: FlowTemplateId, english = false): FlowCanvasState {
  const titles = {
    opening: english
      ? [
          'Opening hand',
          'Your first play',
          'Does a response arrive?',
          'Keep an alternative',
          'Your target board',
        ]
      : [
          'Mano iniziale',
          'La tua prima giocata',
          'Arriva una risposta?',
          'Conserva un’alternativa',
          'Il campo che cerchi',
        ],
    recovery: english
      ? [
          'Available resources',
          'The interruption point',
          'Do you have a follow-up?',
          'Protect your next turn',
          'Rebuild your line',
        ]
      : [
          'Risorse disponibili',
          'Il punto di interruzione',
          'Hai un seguito?',
          'Proteggi il prossimo turno',
          'Ricostruisci la linea',
        ],
    second: english
      ? [
          'Opponent’s board',
          'Prepare a bait',
          'Was the response used?',
          'Remove the threat',
          'Develop your board',
        ]
      : [
          'Campo avversario',
          'Prepara un’esca',
          'La risposta è stata usata?',
          'Rimuovi la minaccia',
          'Sviluppa il tuo campo',
        ],
    grind: english
      ? [
          'End-turn resources',
          'Your new draw',
          'Is your engine accessible?',
          'Control and conserve',
          'Restart with an advantage',
        ]
      : [
          'Risorse a fine turno',
          'La tua nuova pescata',
          'Il motore è accessibile?',
          'Controlla e conserva',
          'Riparti con vantaggio',
        ],
  }[id];
  const ids = titles.map(() => crypto.randomUUID());
  return {
    zoom: 0.7,
    panX: 0,
    panY: 0,
    nodes: titles.map((name, i) => ({
      id: ids[i],
      name,
      cardId: null,
      imageSmall: '',
      interrupts: [],
      kind: i === 0 ? 'start' : i === 2 ? 'condition' : i > 2 ? 'outcome' : 'action',
      action: english
        ? 'Add cards, conditions, costs and your intended result.'
        : 'Aggiungi carte, condizioni, costi e il risultato che vuoi ottenere.',
      x: 60 + Math.min(i, 3) * 310,
      y: i === 3 ? 40 : i === 4 ? 340 : 180,
    })),
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ].map(([from, to], i) => ({
      id: crypto.randomUUID(),
      from: ids[from],
      to: ids[to],
      label:
        i === 2
          ? english
            ? 'No / plan B'
            : 'No / piano B'
          : i === 3
            ? english
              ? 'Yes / continue'
              : 'Sì / prosegui'
            : '',
    })),
  };
}
