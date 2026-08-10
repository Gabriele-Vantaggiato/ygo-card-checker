import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of } from 'rxjs';
import { YgoCard } from '../../../models/ygo-card.model';
import {
  CardRoleTag,
  FlowCanvasState,
  FlowCard,
  FlowEdge,
  FlowNode,
  HypergeoResult,
  ResolvedDeck,
  SolitaireState,
  WizardAnalysis,
  YgoFlowDocument,
  scriptToFlowInterrupts,
  scriptToRoles,
  toFlowCard,
} from '../../../models/ygo-flow.model';
import { EffectScriptService } from '../../../services/effect-script.service';
import { I18nService } from '../../../services/i18n.service';
import { YdkeSections, YdkeService } from '../../../services/ydke.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { clamp01, hypergeometricAtLeastOne, hypergeometricBothClasses } from '../../../utils/hypergeo.utils';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { ComboWizardService } from '../services/combo-wizard.service';

export type FlowZoneKey = 'deck' | 'hand' | 'monsters' | 'spellTraps' | 'gy';

const EMPTY_CANVAS: FlowCanvasState = { nodes: [], edges: [], zoom: 1, panX: 0, panY: 0 };
const EMPTY_SOLITAIRE: SolitaireState = { deck: [], hand: [], monsters: [], spellTraps: [], gy: [], log: [] };
const HAND_SIZE = 5;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;
const CANVAS_STEP_X = 190;
const CANVAS_START_Y = 80;

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** Page-scoped signal store for the YgoFlow / Engine Lab route (decklist → canvas, solitaire, wizard). */
@Injectable()
export class YgoFlowStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly ydkeService = inject(YdkeService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly effectScripts = inject(EffectScriptService);
  private readonly i18n = inject(I18nService);
  private readonly comboWizard = inject(ComboWizardService);
  private readonly decklistStore = inject(DecklistStore);

  private pendingCanvas: FlowCanvasState | null = null;
  private pendingRoles: Record<string, CardRoleTag> | null = null;

  /** Kept for .ygoflow round-trip / encode snapshot of the loaded deck. */
  readonly ydkeInput = signal('');
  readonly selectedDeckId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly resolvedDeck = signal<ResolvedDeck | null>(null);
  readonly roles = signal<Record<string, CardRoleTag>>({});

  readonly canvas = signal<FlowCanvasState>(EMPTY_CANVAS);
  readonly linkingFrom = signal<string | null>(null);

  readonly solitaire = signal<SolitaireState>(EMPTY_SOLITAIRE);

  readonly deckOptions = computed(() =>
    this.decklistStore.decklists().map((deck) => ({
      id: deck.id,
      name: deck.name,
      count: deck.cards.reduce((sum, card) => sum + card.quantity, 0),
    })),
  );

  readonly selectedDeckName = computed(() => {
    const id = this.selectedDeckId();
    return this.decklistStore.decklists().find((deck) => deck.id === id)?.name ?? null;
  });

  readonly main = computed<FlowCard[]>(() => this.applyRoles(this.resolvedDeck()?.main ?? []));
  readonly extra = computed<FlowCard[]>(() => this.applyRoles(this.resolvedDeck()?.extra ?? []));
  readonly side = computed<FlowCard[]>(() => this.applyRoles(this.resolvedDeck()?.side ?? []));
  readonly hasDeck = computed(() => this.resolvedDeck() !== null);

  readonly hypergeo = computed<HypergeoResult | null>(() => {
    const main = this.main();
    const deckSize = main.length;
    if (deckSize === 0) {
      return null;
    }
    const starters = main.filter((c) => c.role === 'starter').length;
    const extenders = main.filter((c) => c.role === 'extender').length;
    const handtraps = main.filter((c) => c.role === 'handtrap').length;
    return {
      deckSize,
      starters,
      extenders,
      handtraps,
      pAtLeastOneStarter: hypergeometricAtLeastOne(deckSize, starters, HAND_SIZE),
      pBrick: clamp01(1 - hypergeometricAtLeastOne(deckSize, starters + extenders + handtraps, HAND_SIZE)),
      pStarterPlusExtenderOrTrap: hypergeometricBothClasses(
        deckSize,
        starters,
        extenders + handtraps,
        HAND_SIZE,
      ),
    };
  });

  readonly wizardHandAnalysis = computed<WizardAnalysis | null>(() => {
    const hand = this.solitaire().hand;
    return hand.length === 0 ? null : this.comboWizard.analyzeHand(hand);
  });

  readonly wizardAllStarters = computed<WizardAnalysis[]>(() => {
    const main = this.main();
    return main.length === 0 ? [] : this.comboWizard.analyzeAllStarters({ main });
  });

  readonly wizardChokepoints = computed<string[]>(() => {
    const main = this.main();
    return main.length === 0 ? [] : this.comboWizard.chokepointsAdvice({ main });
  });

  setSelectedDeckId(deckId: string): void {
    this.selectedDeckId.set(deckId || null);
  }

  /** Load the selected (or active) decklist into the lab — preferred entry path. */
  loadFromDecklist(deckId?: string): void {
    const options = this.deckOptions();
    if (options.length === 0) {
      this.errorKey.set('flow.error.noDecklists');
      return;
    }

    const id =
      deckId ??
      this.selectedDeckId() ??
      this.decklistStore.activeDecklistId() ??
      options[0]?.id ??
      null;

    if (!id) {
      this.errorKey.set('flow.error.noDecklists');
      return;
    }

    const deck = this.decklistStore.decklists().find((item) => item.id === id);
    if (!deck) {
      this.errorKey.set('flow.error.noDecklists');
      return;
    }

    this.selectedDeckId.set(id);

    if (deck.cards.length === 0) {
      this.pendingCanvas = null;
      this.pendingRoles = null;
      this.errorKey.set('flow.error.emptyDeck');
      this.resolvedDeck.set(null);
      return;
    }

    const sections = this.ydkeService.splitSections(deck.cards);
    const ydke = this.decklistStore.encodeYdke(id) ?? '';
    this.resolveSections(sections, ydke);
  }

  /** Used only by .ygoflow import (legacy ydke payload inside the document). */
  loadYdke(rawInput?: string): void {
    const input = (rawInput ?? this.ydkeInput()).trim();
    if (!input) {
      this.errorKey.set('flow.error.emptyInput');
      return;
    }

    let sections: YdkeSections;
    try {
      sections = this.ydkeService.parseUrl(input);
    } catch {
      this.pendingCanvas = null;
      this.pendingRoles = null;
      this.errorKey.set('flow.error.invalidYdke');
      return;
    }

    this.resolveSections(sections, input);
  }

  private resolveSections(sections: YdkeSections, ydkeSnapshot: string): void {
    const allIds = [...sections.main, ...sections.extra, ...sections.side];
    if (allIds.length === 0) {
      this.pendingCanvas = null;
      this.pendingRoles = null;
      this.errorKey.set('flow.error.emptyDeck');
      return;
    }

    this.loading.set(true);
    this.errorKey.set(null);
    const lang = this.i18n.lang();

    forkJoin({
      cards: this.ygoApi.getCardsByIds$(allIds, lang),
      scripts: this.effectScripts.ensureLoaded$().pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ cards }) => {
          this.loading.set(false);
          if (cards.length === 0) {
            this.pendingCanvas = null;
            this.pendingRoles = null;
            this.errorKey.set('flow.error.apiFailed');
            return;
          }

          const byId = new Map(cards.map((card) => [card.id, card]));
          const build = (ids: readonly number[]): FlowCard[] =>
            ids
              .map((id) => byId.get(id))
              .filter((card): card is YgoCard => !!card)
              .map((card) => toFlowCard(card, scriptToRoles(this.effectScripts.getScript(card.id))));

          const main = build(sections.main);
          const extra = build(sections.extra);
          const side = build(sections.side);

          if (main.length === 0 && extra.length === 0 && side.length === 0) {
            this.pendingCanvas = null;
            this.pendingRoles = null;
            this.errorKey.set('flow.error.apiFailed');
            return;
          }

          this.resolvedDeck.set({ ydke: ydkeSnapshot, main, extra, side, byId });
          this.ydkeInput.set(ydkeSnapshot);
          this.roles.set(this.pendingRoles ?? this.defaultRoles([...main, ...extra, ...side]));
          this.canvas.set(this.pendingCanvas ?? EMPTY_CANVAS);
          this.pendingCanvas = null;
          this.pendingRoles = null;
          this.resetSolitaire();
        },
        error: () => {
          this.loading.set(false);
          this.pendingCanvas = null;
          this.pendingRoles = null;
          this.errorKey.set('flow.error.apiFailed');
        },
      });
  }

  setRole(passcode: number, role: CardRoleTag): void {
    this.roles.update((current) => ({ ...current, [String(passcode)]: role }));
  }

  roleFor(passcode: number): CardRoleTag {
    return this.roles()[String(passcode)] ?? 'untagged';
  }

  // ---- Canvas: nodes / edges / zoom / pan --------------------------------

  addNode(card: FlowCard | null, x = 60, y = 60): string {
    const id = nextId('node');
    const script = card ? this.effectScripts.getScript(card.passcode) : undefined;
    const node: FlowNode = {
      id,
      cardId: card?.passcode ?? null,
      name: card?.name ?? this.i18n.t('flow.canvas.blankNode'),
      action: '',
      imageSmall: card?.imageSmall ?? '',
      x,
      y,
      interrupts: scriptToFlowInterrupts(script),
    };
    this.canvas.update((state) => ({ ...state, nodes: [...state.nodes, node] }));
    return id;
  }

  removeNode(id: string): void {
    this.canvas.update((state) => ({
      ...state,
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.from !== id && e.to !== id),
    }));
    if (this.linkingFrom() === id) {
      this.linkingFrom.set(null);
    }
  }

  moveNode(id: string, x: number, y: number): void {
    this.canvas.update((state) => ({
      ...state,
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    }));
  }

  updateNodeAction(id: string, action: string): void {
    this.canvas.update((state) => ({
      ...state,
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, action } : n)),
    }));
  }

  /** Click-to-link: first click arms the source node, second click on a different node connects them. */
  nodeClicked(id: string): void {
    const from = this.linkingFrom();
    if (!from) {
      this.linkingFrom.set(id);
      return;
    }
    if (from === id) {
      this.linkingFrom.set(null);
      return;
    }
    this.linkingFrom.set(null);
    const exists = this.canvas().edges.some((e) => e.from === from && e.to === id);
    if (exists) {
      return;
    }
    const edge: FlowEdge = { id: nextId('edge'), from, to: id };
    this.canvas.update((state) => ({ ...state, edges: [...state.edges, edge] }));
  }

  cancelConnect(): void {
    this.linkingFrom.set(null);
  }

  removeEdge(id: string): void {
    this.canvas.update((state) => ({ ...state, edges: state.edges.filter((e) => e.id !== id) }));
  }

  setZoom(zoom: number): void {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.canvas.update((state) => ({ ...state, zoom: clamped }));
  }

  zoomBy(delta: number): void {
    this.setZoom(this.canvas().zoom + delta);
  }

  panBy(dx: number, dy: number): void {
    this.canvas.update((state) => ({ ...state, panX: state.panX + dx, panY: state.panY + dy }));
  }

  resetCanvas(): void {
    this.canvas.set(EMPTY_CANVAS);
    this.linkingFrom.set(null);
  }

  /** Lays out a wizard analysis line as a left-to-right chain of nodes on the canvas. */
  pushHandComboToCanvas(analysis: WizardAnalysis | null): void {
    if (!analysis || analysis.lines.length === 0) {
      return;
    }
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    let previousId: string | null = null;

    analysis.lines.forEach((step, index) => {
      const card = step.cardId != null ? this.findCardByPasscode(step.cardId) : undefined;
      const id = nextId('node');
      nodes.push({
        id,
        cardId: step.cardId ?? null,
        name: card?.name ?? step.title,
        action: step.detail,
        imageSmall: card?.imageSmall ?? '',
        x: 60 + index * CANVAS_STEP_X,
        y: CANVAS_START_Y,
        interrupts: step.interruptRisk,
      });
      if (previousId) {
        edges.push({ id: nextId('edge'), from: previousId, to: id });
      }
      previousId = id;
    });

    this.canvas.set({ nodes, edges, zoom: 1, panX: 0, panY: 0 });
  }

  pushWizardHandToCanvas(): void {
    this.pushHandComboToCanvas(this.wizardHandAnalysis());
  }

  // ---- Solitaire ----------------------------------------------------------

  drawHand(): void {
    const main = this.main();
    if (main.length === 0) {
      return;
    }
    const pool = shuffled(main);
    this.solitaire.set({
      deck: pool.slice(HAND_SIZE),
      hand: pool.slice(0, HAND_SIZE),
      monsters: [],
      spellTraps: [],
      gy: [],
      log: [this.i18n.t('flow.solitaire.log.draw', { count: String(HAND_SIZE) })],
    });
  }

  redrawHand(): void {
    this.drawHand();
  }

  resetSolitaire(): void {
    this.solitaire.set(EMPTY_SOLITAIRE);
  }

  drawOne(): void {
    const state = this.solitaire();
    const [next, ...rest] = state.deck;
    if (!next) {
      return;
    }
    this.solitaire.set({
      ...state,
      deck: rest,
      hand: [...state.hand, next],
      log: [...state.log, this.i18n.t('flow.solitaire.log.drawOne', { name: next.name })],
    });
  }

  moveCard(uid: string, from: FlowZoneKey, to: FlowZoneKey): void {
    if (from === to) {
      return;
    }
    const state = this.solitaire();
    const card = state[from].find((c) => c.uid === uid);
    if (!card) {
      return;
    }
    this.solitaire.set({
      ...state,
      [from]: state[from].filter((c) => c.uid !== uid),
      [to]: [...state[to], card],
      log: [
        ...state.log,
        this.i18n.t('flow.solitaire.log.move', {
          name: card.name,
          zone: this.i18n.t(`flow.solitaire.zone.${to}`),
        }),
      ],
    });
  }

  // ---- Import / export ------------------------------------------------------

  exportDocument(): YgoFlowDocument {
    const ydke =
      (this.selectedDeckId() ? this.decklistStore.encodeYdke(this.selectedDeckId()!) : null) ??
      this.ydkeInput() ??
      this.resolvedDeck()?.ydke ??
      '';
    return {
      version: 1,
      ydke,
      canvas: this.canvas(),
      roles: this.roles(),
      savedAt: new Date().toISOString(),
    };
  }

  loadDocument(doc: YgoFlowDocument): void {
    this.pendingCanvas = doc.canvas;
    this.pendingRoles = doc.roles;
    this.loadYdke(doc.ydke);
  }

  private findCardByPasscode(passcode: number): FlowCard | undefined {
    const deck = this.resolvedDeck();
    if (!deck) {
      return undefined;
    }
    return [...deck.main, ...deck.extra, ...deck.side].find((c) => c.passcode === passcode);
  }

  private applyRoles(cards: readonly FlowCard[]): FlowCard[] {
    const roles = this.roles();
    return cards.map((card) => {
      const override = roles[String(card.passcode)];
      return override && override !== card.role ? { ...card, role: override } : card;
    });
  }

  private defaultRoles(cards: readonly FlowCard[]): Record<string, CardRoleTag> {
    const map: Record<string, CardRoleTag> = {};
    for (const card of cards) {
      const key = String(card.passcode);
      if (!(key in map)) {
        map[key] = card.role;
      }
    }
    return map;
  }
}
