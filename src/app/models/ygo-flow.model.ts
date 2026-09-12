import { EffectScript } from './effect-script.model';
import { YgoCard } from './ygo-card.model';

export type FlowZone = 'hand' | 'monster' | 'spellTrap' | 'gy' | 'deck' | 'extra' | 'banish';

export type CardRoleTag = 'starter' | 'extender' | 'handtrap' | 'interaction' | 'untagged';

export type FlowInterrupt = 'veiler' | 'maxx_c' | 'bottomless' | 'nightmare';

export interface FlowCard {
  uid: string;
  passcode: number;
  name: string;
  type: string;
  desc: string;
  imageSmall: string;
  image: string;
  role: CardRoleTag;
}

export type FlowNodeKind = 'start' | 'action' | 'condition' | 'outcome' | 'note';

export interface FlowNode {
  /** Card snapshot travels with the Flow, even without an associated deck. */
  card?: YgoCard;
  kind?: FlowNodeKind;
  notes?: string;
  collapsed?: boolean;
  id: string;
  cardId: number | null;
  name: string;
  action: string;
  imageSmall: string;
  x: number;
  y: number;
  interrupts: FlowInterrupt[];
}

export interface FlowEdge {
  label?: string;
  id: string;
  from: string;
  to: string;
}

export interface FlowCanvasState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  zoom: number;
  panX: number;
  panY: number;
}

export interface SolitaireState {
  extra: FlowCard[];
  banish: FlowCard[];
  deck: FlowCard[];
  hand: FlowCard[];
  monsters: FlowCard[];
  spellTraps: FlowCard[];
  gy: FlowCard[];
  log: string[];
}

export interface HypergeoResult {
  deckSize: number;
  starters: number;
  extenders: number;
  handtraps: number;
  pAtLeastOneStarter: number;
  pBrick: number;
  pStarterPlusExtenderOrTrap: number;
}

export interface WizardLineStep {
  order: number;
  title: string;
  detail: string;
  cardId?: number;
  interruptRisk: FlowInterrupt[];
}

export interface WizardAnalysis {
  kind: 'combo' | 'control' | 'unclassified';
  starters: FlowCard[];
  lines: WizardLineStep[];
  advice: string[];
}

export interface YgoFlowDocument {
  id?: string;
  name?: string;
  version: 1 | 2;
  context?: {
    deckId: string | null;
    deckName: string;
    deckUpdatedAt: string;
    formatId: string;
    banlistDate: string | null;
  };
  /** Card data for the exact YDKE snapshot, including offline restoration. */
  cards?: YgoCard[];
  handSize?: 5 | 6;
  seed?: string;
  ydke: string;
  canvas: FlowCanvasState;
  roles: Record<string, CardRoleTag>;
  savedAt: string;
}

export interface ResolvedDeck {
  ydke: string;
  main: FlowCard[];
  extra: FlowCard[];
  side: FlowCard[];
  byId: Map<number, YgoCard>;
}

export function cardImageSmall(card: YgoCard | undefined): string {
  return card?.card_images?.[0]?.image_url_small ?? '';
}

export function cardImage(card: YgoCard | undefined): string {
  return card?.card_images?.[0]?.image_url ?? '';
}

export function toFlowCard(card: YgoCard, role: CardRoleTag = 'untagged'): FlowCard {
  return {
    uid: `${card.id}-${Math.random().toString(36).slice(2, 9)}`,
    passcode: card.id,
    name: card.name,
    type: card.type,
    desc: card.desc,
    imageSmall: cardImageSmall(card),
    image: cardImage(card),
    role,
  };
}

export function scriptToRoles(script: EffectScript | undefined): CardRoleTag {
  if (!script) {
    return 'untagged';
  }
  if (script.roles.includes('starter')) {
    return 'starter';
  }
  if (script.roles.includes('handtrap')) {
    return 'handtrap';
  }
  if (script.roles.includes('trap')) {
    return 'interaction';
  }
  if (script.roles.includes('extender')) {
    return 'extender';
  }
  return 'untagged';
}

const FLOW_INTERRUPT_TAGS: readonly FlowInterrupt[] = ['veiler', 'maxx_c', 'bottomless', 'nightmare'];

/** Narrows an effect script's interrupt tags down to the subset the canvas/wizard can badge. */
export function scriptToFlowInterrupts(script: EffectScript | undefined): FlowInterrupt[] {
  if (!script) {
    return [];
  }
  return script.interrupts.filter((tag): tag is FlowInterrupt =>
    (FLOW_INTERRUPT_TAGS as readonly string[]).includes(tag),
  );
}
