import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { YgoFlowStore } from './ygo-flow.store';
import { YdkeService, passcodesToBase64 } from '../../../services/ydke.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { EffectScriptService } from '../../../services/effect-script.service';
import { I18nService } from '../../../services/i18n.service';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { ComboWizardService } from '../services/combo-wizard.service';
import { YgoFlowDocument } from '../../../models/ygo-flow.model';
import { YgoCard } from '../../../models/ygo-card.model';

const cards: YgoCard[] = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1,
  name: `Card ${i + 1}`,
  type: 'Effect Monster',
  desc: '',
  card_images: [],
}));
const ydke = `ydke://${passcodesToBase64([1, 1, 2, 3, 4, 5, 6, 7])}!${passcodesToBase64([8])}!${passcodesToBase64([9])}!`;
const snapshot = (): YgoFlowDocument => ({
  version: 2,
  id: 'snapshot',
  name: 'Snapshot',
  ydke,
  cards,
  canvas: { nodes: [], edges: [], zoom: 1, panX: 0, panY: 0 },
  roles: { '1': 'starter', '2': 'interaction' },
  savedAt: new Date().toISOString(),
  handSize: 6,
  seed: 'replay',
});

describe('Flow deck snapshots and manual board', () => {
  let store: YgoFlowStore, api: jasmine.Spy;
  beforeEach(() => {
    spyOn(Storage.prototype, 'getItem').and.returnValue(null);
    spyOn(Storage.prototype, 'setItem');
    api = jasmine.createSpy().and.returnValue(of(cards));
    TestBed.configureTestingModule({
      providers: [
        YgoFlowStore,
        YdkeService,
        { provide: YgoApiService, useValue: { getCardsByIds$: api } },
        {
          provide: EffectScriptService,
          useValue: { getScript: () => undefined, ensureStudyLoaded$: () => of(null) },
        },
        { provide: I18nService, useValue: { lang: signal('it'), t: (key: string) => key } },
        { provide: ComboWizardService, useValue: {} },
        {
          provide: DecklistStore,
          useValue: {
            decklists: signal([]),
            activeDecklistId: signal(null),
            encodeYdke: () => 'changed-deck',
          },
        },
      ],
    });
    store = TestBed.inject(YgoFlowStore);
  });
  it('restores snapshot cards and manual roles without a card API request', () => {
    store.loadDocument(snapshot());
    expect(api).not.toHaveBeenCalled();
    expect(store.main().length).toBe(8);
    expect(store.roleFor(1)).toBe('starter');
    expect(store.roleFor(2)).toBe('interaction');
    expect(store.handSize()).toBe(6);
    store.drawHand();
    expect(store.solitaire().hand.length).toBe(6);
    expect(store.solitaire().extra.length).toBe(1);
    expect(store.side().length).toBe(1);
  });
  it('exports the studied snapshot even when the linked deck has changed', () => {
    store.loadDocument(snapshot());
    store.selectedDeckId.set('edited');
    expect(store.exportDocument().ydke).toBe(ydke);
  });
  it('blocks partial card resolution and preserves overrides for retry', () => {
    api.and.returnValue(of(cards.slice(0, 2)));
    store.loadDocument({ ...snapshot(), cards: undefined });
    expect(store.hasDeck()).toBeFalse();
    expect(store.errorKey()).toBe('studio.error.missingCards');
    expect(store.missingIds()).toContain(9);
    api.and.returnValue(of(cards));
    store.loadYdke();
    expect(store.hasDeck()).toBeTrue();
    expect(store.roleFor(1)).toBe('starter');
  });
  it('conserves main and extra copies across movement, drawing and undo', () => {
    store.loadDocument(snapshot());
    store.drawHand();
    const before = store.solitaire();
    store.moveCard(before.hand[0].uid, 'hand', 'banish');
    store.drawOne();
    const state = store.solitaire();
    const all = [
      ...state.deck,
      ...state.extra,
      ...state.hand,
      ...state.monsters,
      ...state.spellTraps,
      ...state.gy,
      ...state.banish,
    ];
    expect(all.length).toBe(9);
    expect(new Set(all.map((c) => c.uid)).size).toBe(9);
    store.undoSolitaire();
    store.undoSolitaire();
    expect(store.solitaire()).toEqual(before);
    const hand = before.hand.map((c) => c.passcode);
    store.drawHand();
    expect(store.solitaire().hand.map((c) => c.passcode)).toEqual(hand);
  });
  it('rejects too many copies atomically when composing a hand', () => {
    store.loadDocument(snapshot());
    store.drawHand();
    const before = store.solitaire();
    expect(store.composeHand([1, 1, 1, 2, 3, 4])).toBeFalse();
    expect(store.solitaire()).toEqual(before);
    expect(store.composeHand([1, 1, 2, 3, 4, 5])).toBeTrue();
    expect(store.solitaire().hand.map((c) => c.passcode)).toEqual([1, 1, 2, 3, 4, 5]);
    expect(store.solitaire().deck.map((c) => c.passcode)).toEqual([6, 7]);
  });
});
