import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { DuelCoachStore } from './duel-coach.store';
import { YgoApiService } from '../../../services/ygo-api.service';
import { ComboSheetLibraryService } from '../../combo-sheets/combo-sheet-library.service';
import { FlowLibraryService } from '../../ygo-flow/services/flow-library.service';
import { Yrp3dParserService } from '../../replay/services/yrp3d-parser.service';
import { ydkeSectionsToUrl } from '../../../services/ydke.service';
import { ParsedReplay } from '../../../models/replay.model';
import { YgoCard } from '../../../models/ygo-card.model';
import { routeFixture } from './duel-coach.model.spec';
import { ComboSheet } from '../../combo-sheets/combo-sheet.model';
import { CoachRun } from './duel-coach.model';
import { lineReplay } from '../../../testing/replay-line.fixtures';
import { PasscodeCatalogService } from '../../../services/passcode-catalog.service';

describe('DuelCoachStore', () => {
  let store: DuelCoachStore;
  let http: HttpTestingController;
  let archive: string | null;
  let save: jasmine.Spy;
  let parse: jasmine.Spy;
  let api: jasmine.Spy;
  const sections = { main: [1,2,3,4,5,6],extra: [9],side: [10] };
  const ydke = ydkeSectionsToUrl(sections);
  const sheet: ComboSheet = { schemaVersion: 1,id: 'sheet',title: 'Test',description: '',author: '',accent: '',tags: [],tabs: [{ id: 'test',title: 'Test',combos: [routeFixture().guide] }] };
  beforeEach(() => {
    archive = localStorage.getItem('ygo-duel-coach-runs-v1'); localStorage.removeItem('ygo-duel-coach-runs-v1');
    save = jasmine.createSpy('save').and.returnValue(true); parse = jasmine.createSpy('parseFile'); api = jasmine.createSpy('getCardsByIds$').and.returnValue(of([]));
    TestBed.configureTestingModule({ providers: [provideHttpClient(),provideHttpClientTesting(),
      { provide: YgoApiService,useValue: { getCardsByIds$: api } },
      { provide: PasscodeCatalogService,useValue: { get: () => null,ensureLoaded$: () => of(new Map()) } },
      { provide: ComboSheetLibraryService,useValue: { sheets: signal([]),save } },
      { provide: FlowLibraryService,useValue: { documents: signal([]) } },
      { provide: Yrp3dParserService,useValue: { parseFile: parse } },
    ] });
    store = TestBed.inject(DuelCoachStore); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify(); TestBed.resetTestingModule();
    if (archive === null) localStorage.removeItem('ygo-duel-coach-runs-v1'); else localStorage.setItem('ygo-duel-coach-runs-v1',archive);
  });
  async function load(): Promise<void> {
    store.useDeck(ydke,'Test');
    http.expectOne('assets/data/combo-sheets/deck-recipes.json').flush([{ key: 'test',main: { '1': 1,'2': 1,'3': 1 },extra: { '9': 1 },deck: { '3': 1 },guide: routeFixture().guide }]);
    http.expectOne('assets/data/combo-sheets/starter-example.json').flush(sheet);
    await Promise.resolve(); await Promise.resolve();
  }
  function start(): void {
    [1,2,4,5,6].forEach(id => store.addToHand(id));
    store.start(store.candidates()[0].id);
  }
  function replay(): ParsedReplay {
    return lineReplay({ sha256: 'a'.repeat(64),fileName: 'test.yrp3d',focusController: 0,masterRule: 5,focusWon: true,
      decks: { focus: sections,opponent: { main: [],extra: [],side: [] } },events: [
        { kind: 'draw',controller: 0,cards: [1,2,4,5,6],value: 5,rawType: 'draw' },
        { kind: 'new_turn',controller: 0,turn: 1,rawType: 'turn' },
        { kind: 'summon',controller: 0,code: 1,rawType: 'summon' },
        { kind: 'chain',controller: 0,code: 1,rawType: 'chain' },
      ] });
  }
  it('loads recipes, checks real hand and keeps repeated ordered actions', async () => {
    await load(); start();
    expect(store.next()?.action).toBe('normal-summon');
    store.confirmNext(); store.confirmNext(); store.confirmNext();
    expect(store.comparison().status).toBe('complete');
    expect(store.moves().map(m => m.action)).toEqual(['normal-summon','activate','normal-summon']);
  });
  it('does not treat OCR inspection as a played card', async () => {
    await load(); start(); store.observedCard.set({ id: 1,name: 'Starter' });
    expect(store.moves()).toEqual([]); expect(store.next()?.action).toBe('normal-summon');
  });
  it('freezes the deck and route while recording, and stops next-step suggestions on deviations', async () => {
    await load(); start();
    expect(store.useDeck(ydke,'Other')).toBeFalse();
    store.record(2,'activate'); expect(store.next()).toBeNull();
    expect(store.comparison().status).toBe('deviation');
    store.undo(); expect(store.next()?.cardId).toBe(1);
    store.interrupted.set(true); expect(store.next()).toBeNull();
  });
  it('does not accept Side cards as moves, limits hand quantities and permits cancelling an empty start', async () => {
    await load(); start(); store.record(10,'activate'); expect(store.moves()).toEqual([]);
    store.newOpening(); store.addToHand(1); store.addToHand(1);
    expect(store.hand()).toEqual([1]); expect(store.recording()).toBeFalse();
  });
  it('archives successful confirmed lines as observations, keeps the opening hand, and does not certify an endboard', async () => {
    await load(); start(); store.confirmNext(); store.confirmNext(); store.finish('success');
    const run = store.history()[0]; expect(run.source).toBe('confirmed'); expect(run.opening).toEqual([1,2,4,5,6]);
    store.saveAsSheet(run);
    const saved = save.calls.mostRecent().args[0] as ComboSheet;
    expect(saved.tags).toContain('da-verificare'); expect(saved.tabs[0].combos[0].endCards).toEqual([]);
    expect(saved.tabs[0].combos[0].steps.length).toBe(2);
    store.saveAsSheet({ ...run,interrupted: true }); store.saveAsSheet({ ...run,outcome: 'unknown' });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('deduplicates replay hashes, uses visible first-turn actions, and rejects a wrong deck', async () => {
    await load(); parse.and.returnValue(Promise.resolve(replay()));
    await store.importReplay(new File(['x'],'test.yrp3d')); await store.importReplay(new File(['x'],'test.yrp3d'));
    expect(store.history().length).toBe(1); expect(store.history()[0].source).toBe('replay');
    const wrong = replay(); wrong.decks!.focus = { ...sections,side: [] }; parse.and.returnValue(Promise.resolve(wrong));
    await store.importReplay(new File(['x'],'wrong.yrp3d')); expect(store.error()).toContain('non coincide');
    expect(store.history().length).toBe(1);
  });
  it('ignores replay completion and API resolution after the deck context changes', async () => {
    await load();
    let resolve!: (r: ParsedReplay) => void;
    parse.and.returnValue(new Promise<ParsedReplay>(done => resolve = done));
    const pending = store.importReplay(new File(['x'],'late.yrp3d'));
    const cards = new Subject<YgoCard[]>(); api.and.returnValue(cards);
    store.useDeck(ydke,'Second'); store.useDeck(ydke,'Third');
    resolve(replay()); await pending;
    expect(store.history()).toEqual([]); expect(store.deck()?.name).toBe('Third');
    cards.complete();
  });
  it('leaves an invalid archive untouched and retains new results in memory', async () => {
    localStorage.setItem('ygo-duel-coach-runs-v1','corrupted');
    TestBed.resetTestingModule();
    // Create the store in a fresh injection context to exercise its real storage boundary.
    TestBed.configureTestingModule({ providers: [provideHttpClient(),provideHttpClientTesting(),
      { provide: YgoApiService,useValue: { getCardsByIds$: api } }, { provide: ComboSheetLibraryService,useValue: { sheets: signal([]),save } },
      { provide: PasscodeCatalogService,useValue: { get: () => null,ensureLoaded$: () => of(new Map()) } },
      { provide: FlowLibraryService,useValue: { documents: signal([]) } }, { provide: Yrp3dParserService,useValue: { parseFile: parse } }] });
    store = TestBed.inject(DuelCoachStore); http = TestBed.inject(HttpTestingController);
    await load(); start(); store.confirmNext(); store.finish('unknown');
    expect(store.history().length).toBe(1); expect(localStorage.getItem('ygo-duel-coach-runs-v1')).toBe('corrupted');
    expect(store.error()).toContain('non salvato');
  });
});
