import { FlowLibraryService } from '../services/flow-library.service';
import { openingProfile, seededShuffle } from '../services/flow-study.utils';
import { createsCycle, layoutFlow } from '../services/flow-graph.utils';
import { isYgoFlowDocument } from '../services/ygo-flow-io.service';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
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
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { ComboWizardService } from '../services/combo-wizard.service';

export type FlowZoneKey = 'deck' | 'hand' | 'monsters' | 'spellTraps' | 'gy' | 'extra' | 'banish';

const EMPTY_CANVAS: FlowCanvasState = { nodes: [], edges: [], zoom: 1, panX: 0, panY: 0 };
const EMPTY_SOLITAIRE: SolitaireState = {
  extra: [],
  banish: [],
  deck: [],
  hand: [],
  monsters: [],
  spellTraps: [],
  gy: [],
  log: [],
};
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2;
const CANVAS_STEP_X = 324;
const CANVAS_START_Y = 80;

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
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

  readonly library = inject(FlowLibraryService);
  readonly documentId = signal<string>(crypto.randomUUID());
  readonly context = signal<YgoFlowDocument['context']>(undefined);
  readonly handSize = signal<5 | 6>(5);
  readonly seed = signal('duelist-1');
  readonly missingIds = signal<number[]>([]);
  readonly solitaireHistory = signal<SolitaireState[]>([]);
  readonly handSession = signal<{ seed: string; handSize: number } | null>(null);
  private snapshotCards: YgoCard[] | undefined;

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
    if (this.context()) return this.context()!.deckName;
    const id = this.selectedDeckId();
    return this.decklistStore.decklists().find((deck) => deck.id === id)?.name ?? null;
  });

  readonly main = computed<FlowCard[]>(() => this.applyRoles(this.resolvedDeck()?.main ?? []));
  readonly extra = computed<FlowCard[]>(() => this.applyRoles(this.resolvedDeck()?.extra ?? []));
  readonly side = computed<FlowCard[]>(() => this.applyRoles(this.resolvedDeck()?.side ?? []));
  readonly hasDeck = computed(() => this.resolvedDeck() !== null);

  readonly hypergeo = computed<HypergeoResult | null>(() =>
    openingProfile(this.main(), this.handSize()),
  );

  readonly wizardHandAnalysis = computed<WizardAnalysis | null>(() => {
    const hand = this.solitaire().hand;
    return hand.length === 0
      ? null
      : this.comboWizard.analyzeHand(
          this.applyRoles(hand),
          this.resolvedDeck() ?? undefined,
          this.roles(),
        );
  });

  readonly wizardAllStarters = computed<WizardAnalysis[]>(() => {
    const main = this.main();
    return main.length === 0
      ? []
      : this.comboWizard.analyzeAllStarters(
          { main, extra: this.extra(), side: this.side() },
          this.roles(),
        );
  });

  readonly wizardChokepoints = computed<string[]>(() => {
    const main = this.main();
    return main.length === 0 ? [] : this.comboWizard.chokepointsAdvice({ main });
  });

  readonly flowName = signal('Il mio Flow');
  readonly saveState = signal('Salvataggio locale');
  readonly undoStack = signal<FlowCanvasState[]>([]);
  readonly redoStack = signal<FlowCanvasState[]>([]);
  private deckRequest?: Subscription;
  constructor() {
    try {
      const raw = localStorage.getItem('ygo-flow-workspace-v2');
      const doc: unknown = raw ? JSON.parse(raw) : null;
      if (isYgoFlowDocument(doc)) {
        this.documentId.set(doc.id || crypto.randomUUID());
        this.context.set(doc.context);
        this.handSize.set(doc.handSize ?? 5);
        this.seed.set(doc.seed ?? 'duelist-1');
        this.snapshotCards = doc.cards;
        this.pendingRoles = doc.roles;
        this.canvas.set(doc.canvas);
        this.roles.set(doc.roles);
        this.flowName.set(doc.name || 'Il mio Flow');
        this.ydkeInput.set(doc.ydke);
      }
    } catch {
      this.saveState.set('Archivio locale non disponibile');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      try {
        const doc = this.exportDocument();
        this.persistNow();
        localStorage.setItem('ygo-flow-workspace-v2', JSON.stringify(doc));
        this.saveState.set('Salvato su questo dispositivo');
      } catch {
        this.saveState.set('Salvataggio non riuscito: esporta il Flow');
      }
    };
    effect(() => {
      this.documentId();
      this.context();
      this.handSize();
      this.seed();
      this.resolvedDeck();
      this.canvas();
      this.roles();
      this.flowName();
      this.ydkeInput();
      clearTimeout(timer);
      timer = setTimeout(save, 350);
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(timer);
      save();
    });
  }
  checkpoint(): void {
    this.undoStack.update((stack) => [...stack.slice(-49), this.canvas()]);
    this.redoStack.set([]);
  }
  undo(): void {
    const stack = this.undoStack();
    if (!stack.length) return;
    this.redoStack.update((items) => [...items, this.canvas()]);
    this.canvas.set(stack[stack.length - 1]);
    this.undoStack.set(stack.slice(0, -1));
  }
  redo(): void {
    const stack = this.redoStack();
    if (!stack.length) return;
    this.undoStack.update((items) => [...items, this.canvas()]);
    this.canvas.set(stack[stack.length - 1]);
    this.redoStack.set(stack.slice(0, -1));
  }
  editNode(
    id: string,
    patch: Partial<Pick<FlowNode, 'name' | 'action' | 'kind' | 'notes' | 'collapsed'>>,
  ): void {
    this.checkpoint();
    this.canvas.update((state) => ({
      ...state,
      nodes: state.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    }));
  }
  connect(from: string, to: string, label = ''): boolean {
    const state = this.canvas();
    if (
      !state.nodes.some((n) => n.id === from) ||
      !state.nodes.some((n) => n.id === to) ||
      state.edges.some((e) => e.from === from && e.to === to) ||
      createsCycle(state.edges, from, to)
    )
      return false;
    this.checkpoint();
    this.canvas.update((s) => ({
      ...s,
      edges: [...s.edges, { id: nextId('edge'), from, to, label }],
    }));
    return true;
  }
  editEdge(id: string, label: string): void {
    this.checkpoint();
    this.canvas.update((s) => ({
      ...s,
      edges: s.edges.map((e) => (e.id === id ? { ...e, label } : e)),
    }));
  }
  arrange(): void {
    this.checkpoint();
    this.canvas.update(layoutFlow);
  }
  setSelectedDeckId(deckId: string): void {
    this.selectedDeckId.set(deckId || null);
  }

  /** Load the selected (or active) decklist into the lab — preferred entry path. */
  loadFromDecklist(deckId?: string): void {
    this.deckRequest?.unsubscribe();
    this.loading.set(false);
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
    this.context.set({
      ...this.context(),
      deckId: id,
      deckName: deck.name,
      deckUpdatedAt: deck.updatedAt,
      formatId: this.context()?.formatId ?? '',
      banlistDate: this.context()?.banlistDate ?? null,
    });
    this.snapshotCards = undefined;
    this.pendingRoles = null;
    this.resolvedDeck.set(null);
    this.roles.set({});
    this.missingIds.set([]);

    if (deck.cards.length === 0) {
      this.pendingCanvas = null;
      this.pendingRoles = null;
      this.errorKey.set('flow.error.emptyDeck');
      this.resolvedDeck.set(null);
      return;
    }

    const sections = this.ydkeService.splitSections(deck.cards);
    const ydke = this.decklistStore.encodeYdke(id) ?? '';
    this.ydkeInput.set(ydke);
    this.resolveSections(sections, ydke);
  }

  /** Used only by .ygoflow import (legacy ydke payload inside the document). */
  loadYdke(rawInput?: string): void {
    this.deckRequest?.unsubscribe();
    this.loading.set(false);
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
    this.missingIds.set([]);
    this.resolvedDeck.set(null);
    this.errorKey.set(null);
    const lang = this.i18n.lang();

    this.deckRequest?.unsubscribe();
    this.deckRequest = forkJoin({
      cards:
        this.snapshotCards && allIds.every((id) => this.snapshotCards!.some((c) => c.id === id))
          ? of(this.snapshotCards)
          : this.ygoApi.getCardsByIds$(allIds, lang),
      scripts: this.effectScripts.ensureStudyLoaded$().pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ cards }) => {
          this.loading.set(false);
          if (cards.length === 0) {
            this.pendingCanvas = null;
            this.errorKey.set('flow.error.apiFailed');
            return;
          }

          const byId = new Map(cards.map((card) => [card.id, card]));
          const missing = [...new Set(allIds.filter((id) => !byId.has(id)))];
          if (missing.length) {
            this.missingIds.set(missing);
            this.errorKey.set('studio.error.missingCards');
            return;
          }
          const build = (ids: readonly number[]): FlowCard[] =>
            ids
              .map((id) => byId.get(id))
              .filter((card): card is YgoCard => !!card)
              .map((card) =>
                toFlowCard(card, scriptToRoles(this.effectScripts.getScript(card.id))),
              );

          const main = build(sections.main);
          const extra = build(sections.extra);
          const side = build(sections.side);

          if (main.length === 0 && extra.length === 0 && side.length === 0) {
            this.pendingCanvas = null;
            this.errorKey.set('flow.error.apiFailed');
            return;
          }

          this.resolvedDeck.set({ ydke: ydkeSnapshot, main, extra, side, byId });
          this.ydkeInput.set(ydkeSnapshot);
          this.roles.set(this.pendingRoles ?? this.defaultRoles([...main, ...extra, ...side]));
          if (this.pendingCanvas) this.canvas.set(this.pendingCanvas);
          this.pendingCanvas = null;
          this.pendingRoles = null;
          this.resetSolitaire();
        },
        error: () => {
          this.loading.set(false);
          this.pendingCanvas = null;
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
    this.checkpoint();
    const id = nextId('node');
    const script = card ? this.effectScripts.getScript(card.passcode) : undefined;
    const node: FlowNode = {
      id,
      cardId: card?.passcode ?? null,
      card: card
        ? (this.resolvedDeck()?.byId.get(card.passcode) ?? {
            id: card.passcode,
            name: card.name,
            type: card.type,
            desc: card.desc,
            card_images: [
              { id: card.passcode, image_url: card.image, image_url_small: card.imageSmall },
            ],
          })
        : undefined,
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

  attachCard(id: string, card: YgoCard): void {
    this.checkpoint();
    this.canvas.update((state) => ({
      ...state,
      nodes: state.nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              card,
              cardId: card.id,
              name: card.name,
              imageSmall: card.card_images[0]?.image_url_small ?? '',
              interrupts: scriptToFlowInterrupts(this.effectScripts.getScript(card.id)),
            }
          : node,
      ),
    }));
  }
  removeNode(id: string): void {
    this.checkpoint();
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
    this.checkpoint();
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
    this.connect(from, id);
  }

  cancelConnect(): void {
    this.linkingFrom.set(null);
  }

  removeEdge(id: string): void {
    this.checkpoint();
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
    this.checkpoint();
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
        card: step.cardId != null ? this.resolvedDeck()?.byId.get(step.cardId) : undefined,
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

    this.checkpoint();
    this.canvas.set({ nodes, edges, zoom: 1, panX: 0, panY: 0 });
  }

  pushWizardHandToCanvas(): void {
    this.pushHandComboToCanvas(this.wizardHandAnalysis());
  }

  // ---- Solitaire ----------------------------------------------------------

  drawHand(): void {
    const main = this.main();
    if (main.length < this.handSize()) return;
    const pool = seededShuffle(
      [...main].sort((a, b) => a.passcode - b.passcode),
      this.seed(),
    );
    this.solitaireHistory.set([]);
    this.handSession.set({ seed: this.seed(), handSize: this.handSize() });
    this.solitaire.set({
      ...EMPTY_SOLITAIRE,
      extra: this.extra(),
      deck: pool.slice(this.handSize()),
      hand: pool.slice(0, this.handSize()),
      log: [this.i18n.t('flow.solitaire.log.draw', { count: String(this.handSize()) })],
    });
  }

  redrawHand(): void {
    this.seed.set(crypto.randomUUID().slice(0, 8));
    this.drawHand();
  }

  resetSolitaire(): void {
    this.solitaire.set(EMPTY_SOLITAIRE);
    this.solitaireHistory.set([]);
    this.handSession.set(null);
  }

  undoSolitaire(): void {
    const history = this.solitaireHistory();
    if (!history.length) return;
    this.solitaire.set(history[history.length - 1]);
    this.solitaireHistory.set(history.slice(0, -1));
  }

  composeHand(passcodes: number[]): boolean {
    if (passcodes.length !== this.handSize()) return false;
    const deck = [...this.main()];
    const hand: FlowCard[] = [];
    for (const id of passcodes) {
      const index = deck.findIndex((c) => c.passcode === id);
      if (index < 0) return false;
      hand.push(...deck.splice(index, 1));
    }
    this.resetSolitaire();
    this.solitaire.set({ ...EMPTY_SOLITAIRE, deck, hand, extra: this.extra() });
    return true;
  }

  private checkpointSolitaire(): void {
    this.solitaireHistory.update((h) => [...h.slice(-49), this.solitaire()]);
  }

  drawOne(): void {
    const state = this.solitaire();
    const [next, ...rest] = state.deck;
    if (!next) {
      return;
    }
    this.checkpointSolitaire();
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
    this.checkpointSolitaire();
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
    return {
      version: 2,
      id: this.documentId(),
      name: this.flowName(),
      ydke: this.resolvedDeck()?.ydke || this.ydkeInput(),
      context: this.context(),
      handSize: this.handSize(),
      seed: this.seed(),
      cards: this.resolvedDeck() ? [...this.resolvedDeck()!.byId.values()] : this.snapshotCards,
      canvas: this.canvas(),
      roles: this.roles(),
      savedAt: new Date().toISOString(),
    };
  }

  persistNow(): void {
    const doc = this.exportDocument();
    if (doc.canvas.nodes.length || this.library.documents().some(d => d.id === doc.id)) {
      this.library.save(doc);
    }
  }

  newDocument(name = 'Il mio Flow', canvas: FlowCanvasState = EMPTY_CANVAS): void {
    this.persistNow();
    this.documentId.set(crypto.randomUUID());
    this.flowName.set(name);
    this.canvas.set(structuredClone(canvas));
    this.undoStack.set([]);
    this.redoStack.set([]);
    this.linkingFrom.set(null);
  }

  duplicateDocument(): void {
    this.newDocument(`${this.flowName()} · copia`, this.canvas());
    this.persistNow();
  }

  loadDocument(doc: YgoFlowDocument): void {
    this.persistNow();
    this.deckRequest?.unsubscribe();
    this.loading.set(false);
    this.undoStack.set([]);
    this.redoStack.set([]);
    this.linkingFrom.set(null);
    this.resetSolitaire();
    this.documentId.set(doc.id || crypto.randomUUID());
    this.context.set(doc.context);
    this.snapshotCards = doc.cards;
    this.handSize.set(doc.handSize ?? 5);
    this.seed.set(doc.seed ?? 'duelist-1');
    this.selectedDeckId.set(doc.context?.deckId ?? null);
    this.resolvedDeck.set(null);
    this.errorKey.set(null);
    this.missingIds.set([]);
    this.canvas.set(structuredClone(doc.canvas));
    this.roles.set({ ...doc.roles });
    this.flowName.set(doc.name || 'Flow importato');
    this.ydkeInput.set(doc.ydke);
    this.pendingRoles = doc.roles;
    if (doc.ydke) this.loadYdke(doc.ydke);
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
