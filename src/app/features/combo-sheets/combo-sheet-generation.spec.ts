import { Decklist } from '../../models/decklist.model';
import { EffectScriptIndex } from '../../models/effect-script.model';
import { ObservedLine } from '../../models/duel-line.model';
import { splitDeckIntoYdkeSections } from '../../services/ydke.service';
import { deckKey } from '../../utils/replay-lines';
import { ComboSheet, isComboSheet } from './combo-sheet.model';
import { generateComboSheet } from './combo-sheet-generation';

describe('Deck to combo sheet generation', () => {
  const empty: EffectScriptIndex = { version: 1, generatedAt: '', cardCount: 0, scripts: {} };
  const deck = (): Decklist => ({ id: 'deck', name: 'Rabbit', updatedAt: '2026-11-02', cards: [
    { id: 85138716, name: 'Rescue Rabbit', type: 'Effect Monster', quantity: 3, section: 'main', imageUrlSmall: null },
    { id: 37265642, name: 'Sabersaurus', type: 'Normal Monster', quantity: 2, section: 'main', imageUrlSmall: null },
    { id: 74294676, name: 'Evolzar Laggia', type: 'XYZ Monster', quantity: 1, section: 'extra', imageUrlSmall: null },
  ] });
  let template: ComboSheet;
  beforeAll(async () => { template = await fetch('/assets/data/combo-sheets/starter-example.json').then(r => r.json()); });
  const observation = (d: Decklist): ObservedLine => ({
    replayId: 'a'.repeat(64), deckKey: deckKey(splitDeckIntoYdkeSections(d.cards)), masterRule: 3, turn: 1,
    openingHand: [85138716, 85138716, 85138716, 37265642, 37265642],
    actions: [{ kind: 'normal_summon', cardId: 85138716 }, { kind: 'activate', cardId: 85138716 }], won: true, uninterrupted: true,
  });
  it('selects only the recipe whose Extra Deck and Main Deck copy requirements are met', () => {
    const result = generateComboSheet(deck(), empty, [], template, 'HAT');
    expect(result.templates).toBe(1);
    expect(result.sheet!.tabs[0].combos[0].endCards).toEqual([74294676]);
    expect(isComboSheet(result.sheet)).toBeTrue();
    expect(template.tabs[0].combos.length).toBe(2);
  });
  it('does not count side-deck cards or a single Normal Monster as satisfying the recipe', () => {
    const d = deck(); d.cards[1].quantity = 1;
    expect(generateComboSheet(d, empty, [], template, 'HAT').sheet).toBeNull();
    d.cards[1].quantity = 2; d.cards[1].section = 'side';
    expect(generateComboSheet(d, empty, [], template, 'HAT').sheet).toBeNull();
    d.cards[1].section = 'main'; d.cards[2].section = 'main';
    expect(generateComboSheet(d, empty, [], template, 'HAT').sheet).toBeNull();
  });
  it('preserves repeated replay actions and opening hand, without fabricating an endboard', () => {
    const d = deck(), row = observation(d);
    const result = generateComboSheet(d, empty, [row, row], null, 'HAT');
    expect(result.observed).toBe(1);
    const guide = result.sheet!.tabs[0].combos[0];
    expect(guide.startingCards).toEqual(row.openingHand);
    expect(guide.steps.map(s => s.cards)).toEqual([[85138716], [85138716]]);
    expect(guide.endCards).toEqual([]);
    expect(guide.description).toContain('1 replay');
  });
  it('rejects different decks, interrupted lines, unavailable cards and impossible opening hands', () => {
    const d = deck(), row = observation(d);
    const rows: ObservedLine[] = [
      { ...row, deckKey: '1|2' }, { ...row, uninterrupted: false },
      { ...row, actions: [{ kind: 'activate', cardId: 999 }] },
      { ...row, openingHand: [85138716, 85138716, 85138716, 85138716, 37265642] },
    ];
    expect(generateComboSheet(d, empty, rows, null, 'HAT').sheet).toBeNull();
  });
  it('keeps different master rules and turns in separate observed guides', () => {
    const d = deck(), row = observation(d);
    const result = generateComboSheet(d, empty, [row, { ...row, masterRule: 5 }, { ...row, turn: 3 }], null, 'HAT');
    expect(result.observed).toBe(3);
  });
  it('exports conditional starter effects as drafts, retaining costs and avoiding invented targets', () => {
    const d = deck();
    const scripts: EffectScriptIndex = { ...empty, cardCount: 1, scripts: { '85138716': {
      cardId: 85138716, name: 'Rabbit', roles: ['starter'], timings: ['ignition'], interrupts: [], source: 'manual', confidence: 1, luaSource: '',
      steps: [{ id: 'effect', when: 'ignition', cost: ['Banish this face-up card'], actions: [{ op: 'ss', from: 'deck', qty: 2, filter: 'Normal Monsters with the same name' }] }],
    } } };
    const result = generateComboSheet(d, scripts, [], null, 'HAT');
    expect(result.drafts).toBe(1);
    const guide = result.sheet!.tabs[0].combos[0];
    expect(guide.steps[0].text).toContain('Banish this face-up card');
    expect(guide.steps[0].kind).toBe('note');
    expect(guide.steps[0].cards).toEqual([85138716]);
    expect(guide.endCards).toEqual([]);
    expect(isComboSheet(result.sheet)).toBeTrue();
  });
  it('does not invent a sheet for an unsupported deck', () => {
    expect(generateComboSheet(deck(), empty, [], null, 'HAT').sheet).toBeNull();
  });
});
