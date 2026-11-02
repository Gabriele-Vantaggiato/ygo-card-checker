import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Decklist } from '../../../models/decklist.model';
import { YdkeSections, decklistToYdkeUrl, ydkeSectionsToUrl } from '../../../services/ydke.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { PasscodeCatalogService } from '../../../services/passcode-catalog.service';
import { ComboSheetLibraryService } from '../../combo-sheets/combo-sheet-library.service';
import { ComboDeckRecipe, isComboDeckRecipe, matchDeckRecipes } from '../../combo-sheets/combo-deck-recipe';
import { ComboSheet, isComboSheet } from '../../combo-sheets/combo-sheet.model';
import { FlowLibraryService } from '../../ygo-flow/services/flow-library.service';
import { Yrp3dParserService } from '../../replay/services/yrp3d-parser.service';
import { openingLine } from '../../../utils/replay-lines';
import { sheetFromImport } from '../../combo-sheets/combo-sheet-io';
import { MdproBridgeSnapshot, MdproLocalBridgeService } from './mdpro-local-bridge.service';
import { ACTION_LABELS, COACH_ACTIONS, CoachAction, CoachMove, CoachRoute, CoachRun, compareMoves, eligibleWithHand, quantities, routeFitsDeck, routeMoves, sameDeck, validDeck } from './duel-coach.model';

const KEY = 'ygo-duel-coach-runs-v1';
const MAX_RUNS = 100;
@Injectable({ providedIn: 'root' })
export class DuelCoachStore {
  private readonly http = inject(HttpClient);
  private readonly api = inject(YgoApiService);
  private readonly catalog = inject(PasscodeCatalogService);
  readonly library = inject(ComboSheetLibraryService);
  private readonly flows = inject(FlowLibraryService);
  private readonly parser = inject(Yrp3dParserService);
  readonly bridge = inject(MdproLocalBridgeService);
  readonly nativeSync = signal(false);
  readonly autoFollow = signal(false);
  private autoSheetId = '';
  private goalReads = 0;
  private goalReadAt = 0;
  private lastCapture = '';
  private sessionSource: CoachRun['source'] = 'confirmed';
  private sessionCaptureId: string | undefined;
  private readonly capturedHand = signal<number[] | null>(null);
  private readonly recipes = signal<ComboDeckRecipe[]>([]);
  private readonly example = signal<ComboSheet | null>(null);
  private archiveUnreadable = false;
  private generation = 0;
  private loaded = false;
  readonly deck = signal<Decklist | null>(null);
  readonly sections = signal<YdkeSections | null>(null);
  readonly ydke = signal('');
  readonly hand = signal<number[]>([]);
  readonly selectedRouteId = signal('');
  readonly moves = signal<CoachMove[]>([]);
  readonly sessionId = signal('');
  readonly finished = signal(false);
  readonly interrupted = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly loading = signal(false);
  readonly replayBusy = signal(false);
  readonly history = signal<CoachRun[]>([]);
  readonly names = signal<Record<number,string>>({});
  readonly observedCard = signal<{ id: number; name: string } | null>(null);
  private startedAt = '';
  readonly recording = computed(() => !!this.sessionId() && !this.finished());
  readonly cards = computed(() => this.deck()?.cards.filter(c => c.section === 'main') ?? []);
  readonly allCards = computed(() => this.deck()?.cards.filter(c => c.section !== 'side') ?? []);
  readonly routes = computed<CoachRoute[]>(() => {
    const deck = this.deck(), sections = this.sections();
    if (!deck || !sections) return [];
    const recipes = this.recipes();
    const result: CoachRoute[] = matchDeckRecipes(deck, recipes).map(guide => ({
      id: guide.id, title: guide.title, guide, source: 'Modello', deckTargets: recipes.find(r => `recipe-${r.key}` === guide.id)?.deck,
    }));
    const available = new Set([...sections.main,...sections.extra]);
    for (const sheet of [...this.library.sheets(), ...(this.example() ? [this.example()!] : [])]) {
      for (const tab of sheet.tabs.filter(t => t.id !== 'drafts')) for (const guide of tab.combos) {
        if (!guide.steps.length || !routeFitsDeck(guide,sections)) continue;
        if (result.some(r => r.guide.id === guide.id)) continue;
        result.push({ id: `${sheet.id}/${tab.id}/${guide.id}`, title: guide.title, guide, source: 'Scheda · condizioni da verificare',
          deckTargets: guide.startingCards.includes(85138716) && guide.requiredCards.filter(id => id === 37265642).length >= 2 ? { '37265642': 2 } : undefined });
      }
    }
    // A Flow graph is ordered only if it is a single connected path. Branches require a choice.
    for (const flow of this.flows.documents()) {
      let flowDeck: YdkeSections;
      try { flowDeck = validDeck(flow.ydke); } catch { continue; }
      if (!sameDeck(sections,flowDeck)) continue;
      const nodes = flow.canvas.nodes;
      const edges = flow.canvas.edges;
      if (!nodes.length || nodes.length > 100 || edges.length !== nodes.length - 1) continue;
      const roots = nodes.filter(n => !edges.some(e => e.to === n.id));
      if (roots.length !== 1 || nodes.some(n => edges.filter(e => e.from === n.id).length > 1 || edges.filter(e => e.to === n.id).length > 1)) continue;
      const ordered = []; const seen = new Set<string>(); let node = roots[0];
      while (node && !seen.has(node.id)) { ordered.push(node); seen.add(node.id); node = nodes.find(n => n.id === edges.find(e => e.from === node.id)?.to)!; }
      if (ordered.length !== nodes.length || nodes.some(n => n.cardId && !available.has(n.cardId))) continue;
      const guide = { id: flow.id ?? flow.savedAt, title: flow.name || 'Flow', description: 'Flow personale: prerequisiti ed effetti da verificare.',
        startingCards: [], requiredCards: nodes.flatMap(n => n.cardId ? [n.cardId] : []), endCards: [], playsAround: [],
        steps: ordered.filter(n => n.kind !== 'start' && n.kind !== 'outcome' && n.kind !== 'note').map(n => ({ title: n.name || n.action, text: [n.action,n.notes].filter(Boolean).join('\n'), kind: 'manual', cards: n.cardId ? [n.cardId] : [] })) };
      if (guide.steps.length) result.push({ id: `flow/${guide.id}`, title: guide.title, guide, source: 'Flow · conferma manuale dei passi' });
    }
    return result.slice(0,100);
  });
  readonly candidates = computed(() => this.sections() ? this.routes().filter(r => eligibleWithHand(r,this.hand(),this.sections()!)) : []);
  readonly route = signal<CoachRoute | null>(null);
  readonly expected = computed(() => {
    const moves = this.route() ? routeMoves(this.route()!) : [];
    return moves;
  });
  readonly comparison = computed(() => compareMoves(this.expected(),this.moves()));
  readonly next = computed(() => {
    if (this.autoFollow() && (!this.bridge.snapshot()?.live?.active || this.bridge.snapshot()?.live?.limited)) return null;
    return this.recording() && this.route() && !this.interrupted() && this.comparison().status === 'following' ? this.expected()[this.comparison().nextIndex] ?? null : null;
  });
  readonly deckHistory = computed(() => this.history().filter(r => { try { return this.sections() && sameDeck(validDeck(r.ydke),this.sections()!); } catch { return false; } }));

  constructor() {
    effect(() => {
      const next = this.next();
      const hand = this.moves().length ? this.capturedHand() ?? [] : this.hand();
      this.bridge.publishHint({ active: this.recording() && !!next,
        message: this.recording() ? this.interrupted() ? 'Linea interrotta: controlla il campo prima di continuare.' : this.route() ? 'Controlla il campo e aggiorna la cattura Test Hand.' : 'Nessuna combo supportata per questa mano. Registrazione libera.' : 'Coach pronto: scegli mazzo e mano nel sito.',
        hand,ydke: this.ydke(),next: next ? { cardId: next.cardId,name: this.name(next.cardId),action: ACTION_LABELS[next.action],label: next.label,detail: next.detail } : null });
    });
    effect(() => {
      const snapshot = this.bridge.snapshot(), enabled = this.nativeSync();
      if (enabled && snapshot && !this.autoFollow()) untracked(() => this.acceptNativeSnapshot(snapshot));
    });
    effect(() => {
      const snapshot = this.bridge.snapshot(), enabled = this.autoFollow();
      this.loading(); this.routes();
      if (enabled && snapshot) untracked(() => this.followLive(snapshot));
    });
    try {
      const raw = localStorage.getItem(KEY) ?? '[]';
      if (raw.length > 2_000_000) throw new Error('Archive too large');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length > MAX_RUNS || !parsed.every(isCoachRun)) throw new Error('Unreadable archive');
      this.history.set(parsed);
    } catch { this.archiveUnreadable = true; this.error.set('Archivio non leggibile: le nuove registrazioni resteranno esportabili in questa sessione.'); }
  }
  name(id: number): string { return id === 0 ? 'Una carta dalla mano' : this.names()[id] || this.catalog.get(id)?.n || 'Carta da identificare'; }
  async loadCatalog(): Promise<void> {
    if (this.loaded || this.loading()) return;
    this.loading.set(true);
    try {
      const [recipes, example] = await Promise.all([
        firstValueFrom(this.http.get<unknown>('assets/data/combo-sheets/deck-recipes.json')),
        firstValueFrom(this.http.get<unknown>('assets/data/combo-sheets/starter-example.json')),
      ]);
      if (!Array.isArray(recipes) || recipes.length > 100 || !recipes.every(isComboDeckRecipe) || !isComboSheet(example)) throw new Error('Invalid catalog');
      this.recipes.set(recipes); this.example.set(example); this.loaded = true;
    } catch { this.error.set('Catalogo combo non disponibile. Riprova il caricamento.'); }
    finally { this.loading.set(false); }
  }
  useDeck(input: string, name = 'Mazzo MDPro4', snapshot?: Decklist): boolean {
    if (this.recording()) { this.error.set('Termina e archivia la linea prima di cambiare mazzo.'); return false; }
    try {
      const sections = validDeck(input); const generation = ++this.generation;
      const names = Object.fromEntries((snapshot?.cards ?? []).map(c => [c.id,c.name]));
      const cards = (['main','extra','side'] as const).flatMap(section => [...quantities(sections[section])].map(([id,quantity]) => ({ id, name: names[id] || `#${id}`, type: '', imageUrlSmall: null, section, quantity })));
      this.deck.set({ id: snapshot?.id ?? 'mdpro-live', name, updatedAt: new Date().toISOString(), cards });
      this.sections.set(sections); this.ydke.set(ydkeSectionsToUrl(sections)); this.names.set(names);
      this.hand.set([]); this.moves.set([]); this.route.set(null); this.selectedRouteId.set(''); this.sessionId.set(''); this.finished.set(false); this.error.set(''); this.notice.set('Mazzo caricato. Indica la mano iniziale reale.');
      void firstValueFrom(this.catalog.ensureLoaded$()).then(catalog => {
        if (generation !== this.generation) return;
        this.names.update(old => ({ ...Object.fromEntries([...sections.main,...sections.extra].flatMap(id => catalog.has(id) ? [[id,catalog.get(id)!.n]] : [])),...old }));
        this.deck.update(d => d ? { ...d,cards: d.cards.map(c => ({ ...c,name: this.name(c.id),type: catalog.get(c.id)?.t || c.type })) } : null);
      });
      void firstValueFrom(this.api.getCardsByIds$([...new Set([...sections.main,...sections.extra])], 'en')).then(resolved => {
        if (generation !== this.generation) return;
        this.names.update(old => ({ ...old,...Object.fromEntries(resolved.map(c => [c.id,c.name])) }));
        this.deck.update(d => d ? { ...d,cards: d.cards.map(c => ({ ...c,name: this.name(c.id) })) } : null);
      }).catch(() => { if (generation === this.generation) this.notice.set('Nomi non disponibili: puoi usare i passcode.'); });
      void this.loadCatalog(); return true;
    } catch { this.error.set('YDKE non valido: servono Main, Extra e Side completi, senza dati troncati.'); return false; }
  }
  useSavedDeck(deck: Decklist): void { this.useDeck(decklistToYdkeUrl(deck),deck.name,deck); }
  addToHand(id: number): void {
    if (this.sessionId()) return;
    const max = quantities(this.sections()?.main ?? []).get(id) ?? 0;
    if (this.hand().length < 6 && this.hand().filter(c => c === id).length < max) this.hand.update(hand => [...hand,id]);
  }
  removeFromHand(index: number): void { if (!this.sessionId()) this.hand.update(hand => hand.filter((_,i) => i !== index)); }
  start(routeId = this.selectedRouteId()): void {
    if (this.recording() || this.hand().length < 5 || this.hand().length > 6 || !this.deck()) return;
    const route = this.candidates().find(r => r.id === routeId) ?? null;
    if (routeId && !route) { this.error.set('La linea scelta non è più compatibile con la mano. Scegli una linea disponibile.'); return; }
    this.generation++; this.route.set(route ? structuredClone(route) : null); this.moves.set([]); this.finished.set(false); this.sessionSource = 'confirmed'; this.sessionCaptureId = undefined; this.capturedHand.set(null);
    this.interrupted.set(false); this.sessionId.set(crypto.randomUUID()); this.startedAt = new Date().toISOString(); this.error.set(''); this.notice.set('Registrazione con conferma manuale. Aprire una carta non registra una mossa.');
  }
  record(cardId: number, action: CoachAction, label?: string): void {
    if (!this.recording() || !COACH_ACTIONS.includes(action) || !this.allCards().some(c => c.id === cardId) || this.moves().length >= 300) return;
    this.capturedHand.set(null);
    this.sessionSource = 'confirmed';
    this.moves.update(moves => [...moves,{ cardId,action,label: label || `${ACTION_LABELS[action]} ${this.name(cardId)}`,detail: 'Azione confermata dal giocatore.' }]);
  }
  confirmNext(): void { const move = this.next(); if (move) this.record(move.cardId,move.action,move.label); }
  undo(): void { if (this.recording()) this.moves.update(m => m.slice(0,-1)); }
  finish(outcome: CoachRun['outcome'],goalObserved = false): void {
    if (!this.recording() || !this.moves().length) return;
    const run: CoachRun = { id: this.sessionId(), startedAt: this.startedAt, endedAt: new Date().toISOString(), ydke: this.ydke(), deckName: this.deck()!.name,
      opening: [...this.hand()], route: structuredClone(this.route()), moves: structuredClone(this.moves()), outcome, source: this.sessionSource, captureId: this.sessionCaptureId, goalObserved, interrupted: this.interrupted() };
    this.finished.set(true); this.saveRun(run); this.notice.set('Linea archiviata. L’esito dichiarato non certifica la correttezza degli effetti.');
  }
  newOpening(): void {
    if (this.recording() && this.moves().length) return;
    this.generation++; this.sessionId.set(''); this.hand.set([]); this.moves.set([]); this.route.set(null); this.selectedRouteId.set(''); this.finished.set(false); this.interrupted.set(false);
  }
  async importReplay(file: File): Promise<void> {
    if (this.replayBusy() || !this.sections()) return;
    const generation = this.generation; const sections = this.sections()!; const ydke = this.ydke(); const name = this.deck()!.name;
    this.replayBusy.set(true); this.error.set('');
    try {
      const replay = await this.parser.parseFile(file);
      if (generation !== this.generation) return;
      if (!replay.decks || !sameDeck(sections,replay.decks.focus)) throw new Error('Il mazzo del giocatore locale nel replay non coincide con Main, Extra e Side caricati.');
      const observed = openingLine(replay);
      if (!observed) throw new Error('Replay non utilizzabile: mano iniziale visibile o azioni del primo turno mancanti.');
      if (this.history().some(r => r.replayId === replay.sha256)) { this.notice.set('Questo replay è già archiviato.'); return; }
      const kinds = { normal_summon: 'normal-summon', special_summon: 'special-summon', activate: 'activate', set: 'set' } as const;
      const moves = observed.actions.map(a => ({ cardId: a.cardId,action: kinds[a.kind],label: this.name(a.cardId),detail: 'Azione osservata nel replay; risoluzione non certificata.' }));
      const selected = this.route();
      const comparable = selected && eligibleWithHand(selected,observed.openingHand,sections) ? structuredClone(selected) : null;
      this.saveRun({ id: crypto.randomUUID(), startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), ydke,deckName: name,
        opening: observed.openingHand,route: comparable,moves,outcome: replay.focusWon === true ? 'success' : replay.focusWon === false ? 'failed' : 'unknown',
        source: 'replay',replayId: replay.sha256,interrupted: !observed.uninterrupted, masterRule: observed.masterRule,turn: observed.turn });
      this.notice.set('Replay archiviato: primo turno proprio, azioni visibili. Vittoria della partita ed efficacia della combo sono valutazioni diverse.');
    } catch (error) { if (generation === this.generation) this.error.set(error instanceof Error && !error.message.startsWith('replay.') ? error.message : 'Replay non leggibile: scegli un file .yrp3d valido.'); }
    finally { this.replayBusy.set(false); }
  }
  async importNativeCapture(file: File): Promise<void> {
    const generation = this.generation;
    if (!this.sections() || this.recording()) { this.error.set('Archivia la linea corrente prima di importare una cattura.'); return; }
    try {
      if (file.size > 2_000_000) throw new Error('Cattura troppo grande.');
      const sheet = sheetFromImport(JSON.parse(await file.text()));
      if (generation !== this.generation) return;
      if (!sheet) throw new Error('File non compatibile con le schede MDPro4.');
      const guides = sheet.tabs.flatMap(t => t.combos);
      if (guides.length !== 1) throw new Error('Seleziona la cattura di una sola linea da Test Hand.');
      const guide = guides[0]; const sections = this.sections()!;
      if (guide.startingCards.length < 5 || guide.startingCards.length > 6 || guide.startingCards.some(id => id <= 0) ||
          !routeFitsDeck(guide,sections)) throw new Error('Le carte della cattura non sono compatibili con il mazzo caricato.');
      const captured = routeMoves({ id: sheet.id,title: sheet.title,source: 'MDPro4',guide });
      if (!captured.length || captured.some(m => m.action === 'instruction')) throw new Error('La cattura non espone azioni confrontabili.');
      if (this.history().some(run => run.captureId === sheet.id)) { this.notice.set('Questa cattura è già archiviata.'); return; }
      const selected = this.route();
      const route = selected && eligibleWithHand(selected,guide.startingCards,sections) ? structuredClone(selected) : null;
      this.saveRun({ id: crypto.randomUUID(),startedAt: new Date().toISOString(),endedAt: new Date().toISOString(),ydke: this.ydke(),deckName: this.deck()!.name,
        opening: [...guide.startingCards],route,moves: captured,outcome: 'unknown',source: 'mdpro',captureId: sheet.id,interrupted: false });
      this.notice.set('Cattura MDPro4 importata. Le carte sono compatibili; il file non contiene l’YDKE completo né un esito verificato. Il mazzo resta associato da te.');
    } catch (error) { if (generation === this.generation) this.error.set(error instanceof Error ? error.message : 'Cattura non leggibile.'); }
  }
  importLatestCapture(): void {
    const capture = this.bridge.snapshot()?.capture;
    if (capture) void this.importNativeCapture(new File([JSON.stringify(capture.sheet)],'mdpro-capture.json',{ type: 'application/json' }));
  }
  startAutomatic(): void {
    this.autoSheetId = ''; this.autoFollow.set(true); this.nativeSync.set(true); this.bridge.connect();
  }
  stopAutomatic(): void { this.autoFollow.set(false); this.nativeSync.set(false); this.notice.set('Lettura automatica sospesa.'); }
  private followLive(snapshot: MdproBridgeSnapshot): void {
    const live = snapshot.live;
    if (!live?.active || !live.sheet || !live.deck) return;
    const guides = live.sheet.tabs.flatMap(tab => tab.combos), guide = guides[0];
    if (guides.length !== 1 || !guide || guide.startingCards.length < 5 || guide.startingCards.length > 6 || guide.startingCards.some(id => id <= 0)) return;
    const sections = validDeck(live.deck.ydke);
    if (!routeFitsDeck(guide,sections)) { this.error.set('Il registratore e il mazzo selezionato non coincidono. Suggerimenti sospesi.'); this.interrupted.set(true); return; }
    if (this.autoSheetId !== live.sessionId) {
      if (this.recording() && this.moves().length) this.finish('unknown');
      else if (this.recording()) this.newOpening();
      if (!this.useDeck(live.deck.ydke,live.deck.name)) return;
      this.hand.set([...guide.startingCards]); this.autoSheetId = live.sessionId; this.goalReads = 0; this.goalReadAt = 0;
    }
    if (this.loading()) return;
    const observed = routeMoves({ id: live.sheet.id,title: live.sheet.title,guide,source: 'MDPro4' });
    if (observed.some(move => move.action === 'instruction') || live.limited) { this.interrupted.set(true); this.error.set('Il registratore segnala azioni non coperte: occorre rivedere la linea.'); return; }
    const observable = (route: CoachRoute) => routeMoves(route);
    const compatible = this.candidates().filter(route => route.source === 'Modello' && !route.title.startsWith('Situazionale:') && compareMoves(observable(route),observed).status !== 'deviation');
    if (!this.sessionId()) this.start(compatible[0]?.id ?? '');
    if (!this.recording()) return;
    if (this.route() && compareMoves(observable(this.route()!),observed).status === 'deviation' && compatible.length) {
      this.route.set(structuredClone(compatible[0])); this.notice.set('Linea adattata alle mosse osservate in MDPro4.');
    }
    this.sessionSource = 'mdpro'; this.sessionCaptureId = live.sessionId;
    this.capturedHand.set((guide.endFlow ?? []).filter(c => c.zone === 'hand').map(c => c.card));
    this.moves.set(observed); this.error.set('');
    this.notice.set('Mano e mosse lette dal registratore Test Hand. Nessuna conferma manuale richiesta per avanzare.');
    const target = this.route()?.guide.endFlow ?? [];
    const actual = quantities((guide.endFlow ?? []).map(c => `${c.zone}:${c.card}`));
    const required = quantities(target.map(c => `${c.zone}:${c.card}`));
    const reached = this.comparison().status === 'complete' && target.length > 0 && target.every(c => c.card > 0) && [...required].every(([id,n]) => (actual.get(id) ?? 0) >= n);
    if (live.observedAt !== this.goalReadAt) { this.goalReads = reached ? this.goalReads+1 : 0; this.goalReadAt = live.observedAt; }
    if (this.goalReads >= 2) {
      this.finish('success',true); const run = this.history()[0];
      if (run) this.saveAsSheet(run);
      this.notice.set('Campo obiettivo osservato in due letture native: linea archiviata e salvata come osservata, da verificare.');
    }
  }
  private acceptNativeSnapshot(snapshot: MdproBridgeSnapshot): void {
    const capture = snapshot.capture;
    if (!this.recording() || !capture || capture.updated < Date.parse(this.startedAt)) return;
    const key = `${capture.id}:${capture.updated}`;
    if (key === this.lastCapture) return;
    this.lastCapture = key;
    if (!sameDeck(this.sections()!,validDeck(snapshot.activeDeck.ydke))) { this.error.set('Cattura sospesa: il mazzo selezionato in MDPro4 è diverso da quello della sessione.'); return; }
    const guides = capture.sheet.tabs.flatMap(tab => tab.combos);
    const guide = guides[0];
    if (guides.length !== 1 || !guide || !routeFitsDeck(guide,this.sections()!) ||
      [...guide.startingCards].sort((a,b) => a-b).join(',') !== [...this.hand()].sort((a,b) => a-b).join(',')) {
      this.error.set('Cattura sospesa: la mano iniziale o le carte non coincidono con questa sessione.'); return;
    }
    const moves = routeMoves({ id: capture.id,title: capture.sheet.title,guide,source: 'MDPro4' });
    if (!moves.length || moves.some(m => m.action === 'instruction')) { this.error.set('Cattura non confrontabile automaticamente. Importa il file per la revisione.'); return; }
    this.sessionSource = 'mdpro'; this.sessionCaptureId = capture.id;
    this.capturedHand.set((guide.endFlow ?? []).filter(card => card.zone === 'hand' && card.card > 0).map(card => card.card));
    this.moves.set(moves); this.error.set('');
    this.notice.set('Sequenza aggiornata dalla cattura Test Hand. Negazioni, interferenze e risultato finale restano da controllare.');
  }
  markNativeResult(runId: string): void {
    const run = this.history().find(r => r.id === runId);
    if (run?.source === 'mdpro' && run.outcome === 'unknown') {
      this.saveRun({ ...run,outcome: 'success' });
      this.notice.set('Risultato indicato come raggiunto dal giocatore. La registrazione conserva la provenienza MDPro4.');
    }
  }
  comparisonFor(run: CoachRun): ReturnType<typeof compareMoves> | null {
    if (!run.route || run.interrupted) return null;
    const expected = routeMoves(run.route);
    if (run.source === 'confirmed') return compareMoves(expected,run.moves);
    if (run.source === 'mdpro') return compareMoves(expected,run.moves);
    // Replay decoder observes four action kinds. Missing cost/zone data is inconclusive.
    if (expected.some(m => !['normal-summon','special-summon','activate','set'].includes(m.action))) return null;
    return compareMoves(expected,run.moves);
  }
  saveAsSheet(run: CoachRun): void {
    if (run.outcome !== 'success' || run.moves.length < 2 || run.interrupted) return;
    const id = `coach-${run.id}`;
    const sheet: ComboSheet = { schemaVersion: 1,id,title: `Osservata · ${run.deckName}`.slice(0,200),author: '',accent: 'cyan',tags: ['osservata','da-verificare'],
      description: run.goalObserved ? 'Campo obiettivo osservato nel registratore Test Hand in due letture. Non certifica legalità, ottimalità o vittoria della partita.' : run.source !== 'replay' ? 'Linea confermata dal giocatore, efficacia dichiarata. Regole, risoluzioni e campo finale non verificati.' : 'Linea osservata nel primo turno di un replay vinto. La vittoria non prova l’efficacia della combo. Regole e campo finale non verificati.',
      tabs: [{ id: 'observed',title: 'Linee osservate',combos: [{ id,title: 'Sequenza osservata',description: `Mano iniziale conservata. ${run.masterRule ? `Master Rule ${run.masterRule}, turno ${run.turn}.` : 'Contesto dichiarato dal giocatore.'}`,
        startingCards: [...run.opening],requiredCards: [...new Set(run.moves.map(m => m.cardId))],endCards: [],playsAround: [],
        steps: run.moves.map((m,i) => ({ title: `${i+1}. ${ACTION_LABELS[m.action]}` ,text: `${this.name(m.cardId)} · ${m.label}\n${m.detail}`,kind: 'observed',cards: [m.cardId],
          flow: m.action === 'instruction' ? [] : [{ card: m.cardId,action: m.action,join: 'none',zone: '',caption: m.label }] })) }] }] };
    const ok = this.library.save(sheet);
    this.notice.set(ok ? 'Linea salvata nella biblioteca Combo, come osservata e da verificare. Puoi esportarla per MDPro4.' : 'Linea disponibile in memoria: salvataggio locale non riuscito. Esportala prima di chiudere.');
  }
  private saveRun(run: CoachRun): void {
    this.history.update(all => [run,...all.filter(r => r.id !== run.id)].slice(0,MAX_RUNS));
    try {
      const json = JSON.stringify(this.history());
      if (this.archiveUnreadable || json.length > 2_000_000) throw new Error('Storage unavailable');
      localStorage.setItem(KEY,json);
    } catch { this.error.set('Archivio non salvato su disco. Esporta le registrazioni per conservarle.'); }
  }
}

function isCoachRun(value: unknown): value is CoachRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as CoachRun;
  const text = (s: unknown,n = 20000): s is string => typeof s === 'string' && s.length <= n;
  const ids = (v: unknown): v is number[] => Array.isArray(v) && v.length <= 6 && v.every(id => Number.isInteger(id) && id > 0 && id <= 999999999);
  try {
    const sections = validDeck(run.ydke);
    const available = new Set([...sections.main,...sections.extra]);
    const validRoute = run.route === null || (run.route && text(run.route.id,400) && text(run.route.title,200) && text(run.route.source,200) &&
      isComboSheet({ schemaVersion: 1,id: 'validation',title: 'validation',description: '',author: '',accent: '',tags: [],tabs: [{ id: 'validation',title: '',combos: [run.route.guide] }] }));
    return text(run.id,120) && text(run.startedAt,40) && text(run.endedAt,40) && text(run.deckName,200) && ids(run.opening) &&
      [...quantities(run.opening)].every(([id,n]) => (quantities(sections.main).get(id) ?? 0) >= n) &&
      ['success','failed','unknown'].includes(run.outcome) && ['confirmed','replay','mdpro'].includes(run.source) && typeof run.interrupted === 'boolean' &&
      (run.captureId === undefined || text(run.captureId,120)) &&
      (run.replayId === undefined || /^[a-f0-9]{64}$/i.test(run.replayId)) && !!validRoute &&
      Array.isArray(run.moves) && run.moves.length <= 300 && run.moves.every(m => !!m && available.has(m.cardId) && COACH_ACTIONS.includes(m.action) && text(m.label,200) && text(m.detail));
  } catch { return false; }
}
