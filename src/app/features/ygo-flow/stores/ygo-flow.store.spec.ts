import { YgoFlowIoService } from '../services/ygo-flow-io.service';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { YgoFlowStore } from './ygo-flow.store';
import { YdkeService } from '../../../services/ydke.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { EffectScriptService } from '../../../services/effect-script.service';
import { I18nService } from '../../../services/i18n.service';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { ComboWizardService } from '../services/combo-wizard.service';
import { YgoFlowDocument } from '../../../models/ygo-flow.model';

describe('Flow workspace', () => {
  let store: YgoFlowStore;
  let saved: jasmine.Spy;
  beforeEach(() => {
    spyOn(Storage.prototype, 'getItem').and.returnValue(null);
    saved = spyOn(Storage.prototype, 'setItem');
    TestBed.configureTestingModule({
      providers: [
        YgoFlowStore,
        {
          provide: YdkeService,
          useValue: { parseUrl: () => ({ main: [1], extra: [], side: [] }) },
        },
        { provide: YgoApiService, useValue: { getCardsByIds$: () => of([]) } },
        {
          provide: EffectScriptService,
          useValue: { getScript: () => undefined, ensureLoaded$: () => of(null) },
        },
        { provide: I18nService, useValue: { lang: signal('it'), t: (key: string) => key } },
        { provide: ComboWizardService, useValue: {} },
        {
          provide: DecklistStore,
          useValue: {
            decklists: signal([]),
            activeDecklistId: signal(null),
            encodeYdke: () => null,
          },
        },
      ],
    });
    store = TestBed.inject(YgoFlowStore);
  });
  it('undoes deletion with its incident branches and can redo it', () => {
    const a = store.addNode(null),
      b = store.addNode(null);
    store.connect(a, b, 'Sì');
    store.removeNode(b);
    expect(store.canvas().edges.length).toBe(0);
    store.undo();
    expect(store.canvas().nodes.length).toBe(2);
    expect(store.canvas().edges[0].label).toBe('Sì');
    store.redo();
    expect(store.canvas().nodes.length).toBe(1);
  });
  it('does not add cyclic or duplicate connections', () => {
    const a = store.addNode(null),
      b = store.addNode(null);
    expect(store.connect(a, b)).toBeTrue();
    expect(store.connect(b, a)).toBeFalse();
    expect(store.connect(a, b)).toBeFalse();
    expect(store.canvas().edges.length).toBe(1);
  });
  it('restores a standalone document without attempting to load a deck', () => {
    const doc: YgoFlowDocument = {
      version: 1,
      name: 'Piano alternativo',
      ydke: '',
      canvas: { nodes: [], edges: [], zoom: 1, panX: 30, panY: 40 },
      roles: {},
      savedAt: '',
    };
    store.loadDocument(doc);
    expect(store.errorKey()).toBeNull();
    expect(store.flowName()).toBe(doc.name!);
    expect(store.canvas().panX).toBe(30);
  });
  it('persists edits after the debounce', fakeAsync(() => {
    store.addNode(null);
    TestBed.flushEffects();
    tick(400);
    expect(saved).toHaveBeenCalled();
    const doc = JSON.parse(saved.calls.mostRecent().args[1]);
    expect(doc.canvas.nodes.length).toBe(1);
    expect(doc.name).toBe('Il mio Flow');
  }));
  it('round-trips a card, its effect and a conditional branch without a deck', () => {
    const a = store.addNode(null),
      b = store.addNode(null);
    store.attachCard(a, {
      id: 89631139,
      name: 'Blue-Eyes White Dragon',
      type: 'Normal Monster',
      desc: 'Effetto di prova: à → ★',
      atk: 3000,
      def: 2500,
      card_images: [
        {
          id: 89631139,
          image_url: 'https://images.ygoprodeck.com/images/cards/89631139.jpg',
          image_url_small: 'https://images.ygoprodeck.com/images/cards_small/89631139.jpg',
        },
      ],
    });
    store.connect(a, b, 'Se disponibile');
    const io = new YgoFlowIoService(),
      json = io.parseJson(io.serializeJson(store.exportDocument()));
    expect(json.ok).toBeTrue();
    if (!json.ok) return;
    const base64 = io.parseBase64(io.serializeBase64(json.value));
    expect(base64.ok).toBeTrue();
    if (!base64.ok) return;
    store.resetCanvas();
    store.loadDocument(base64.value);
    expect(store.canvas().nodes[0].card?.desc).toBe('Effetto di prova: à → ★');
    expect(store.canvas().nodes[0].card?.atk).toBe(3000);
    expect(store.canvas().edges[0].label).toBe('Se disponibile');
    expect(store.errorKey()).toBeNull();
  });
  it('can undo associating a card with an existing step', () => {
    const id = store.addNode(null);
    store.attachCard(id, {
      id: 1,
      name: 'Test',
      type: 'Effect Monster',
      desc: 'Effect',
      card_images: [],
    });
    store.undo();
    expect(store.canvas().nodes[0].cardId).toBeNull();
    store.redo();
    expect(store.canvas().nodes[0].card?.name).toBe('Test');
  });
});
