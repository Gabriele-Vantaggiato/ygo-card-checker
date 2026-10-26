import { CollectionDraft, CollectionItem } from '../models/collection.model';
import { YgoCard } from '../models/ygo-card.model';
import { applyItemPatch, collectionKey, collectionTotals, extractCardmarketEur, mergeDraft } from './collection.utils';

const draft = (over: Partial<CollectionDraft> = {}): CollectionDraft => ({
  passcode: 1,
  cardName: 'Card',
  setCode: 'LOB-EN001',
  rarity: 'Ultra Rare',
  language: 'EN',
  condition: 'NM',
  firstEdition: false,
  quantity: 1,
  notes: null,
  ...over,
});

const item = (id: string, over: Partial<CollectionDraft> = {}): CollectionItem => ({
  ...draft(over),
  id,
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('collection utils', () => {
  it('collectionKey differs by condition, language, rarity and first edition', () => {
    const base = collectionKey(draft());
    expect(collectionKey(draft({ condition: 'LP' }))).not.toBe(base);
    expect(collectionKey(draft({ language: 'IT' }))).not.toBe(base);
    expect(collectionKey(draft({ rarity: 'Rare' }))).not.toBe(base);
    expect(collectionKey(draft({ firstEdition: true }))).not.toBe(base);
    expect(collectionKey(draft({ quantity: 9, notes: 'x' }))).toBe(base);
  });

  it('mergeDraft adds quantity to a matching entry', () => {
    const merged = mergeDraft([draft({ quantity: 2 })], draft({ quantity: 3 }));
    expect(merged.length).toBe(1);
    expect(merged[0].quantity).toBe(5);
  });

  it('mergeDraft appends a different printing', () => {
    expect(mergeDraft([draft()], draft({ setCode: 'LOB-EN002' })).length).toBe(2);
  });

  it('applyItemPatch updates in place when no twin exists', () => {
    const result = applyItemPatch([item('a')], 'a', { condition: 'LP' }, 'now');
    expect(result?.removedId).toBeNull();
    expect(result?.items[0].condition).toBe('LP');
    expect(result?.items[0].updatedAt).toBe('now');
  });

  it('applyItemPatch merges into a twin and reports the removed id', () => {
    const items = [item('a', { quantity: 1 }), item('b', { condition: 'LP', quantity: 2 })];
    const result = applyItemPatch(items, 'a', { condition: 'LP' }, 'now');
    expect(result?.removedId).toBe('a');
    expect(result?.touchedId).toBe('b');
    expect(result?.items.length).toBe(1);
    expect(result?.items[0].quantity).toBe(3);
  });

  it('applyItemPatch returns null for an unknown id', () => {
    expect(applyItemPatch([item('a')], 'zzz', {}, 'now')).toBeNull();
  });

  it('extractCardmarketEur parses the price and treats 0 / missing as null', () => {
    const card = (price?: string) => ({ card_prices: price === undefined ? [] : [{ cardmarket_price: price }] }) as unknown as YgoCard;
    expect(extractCardmarketEur(card('1.25'))).toBe(1.25);
    expect(extractCardmarketEur(card('0.00'))).toBeNull();
    expect(extractCardmarketEur(card())).toBeNull();
  });

  it('collectionTotals sums quantity, unique cards and priced value', () => {
    const items = [item('a', { passcode: 1, quantity: 2 }), item('b', { passcode: 1, setCode: 'X-EN001', quantity: 1 }), item('c', { passcode: 2, quantity: 4 })];
    const prices = new Map<number, number | null>([[1, 2.5], [2, null]]);
    expect(collectionTotals(items, prices)).toEqual({ totalCards: 7, uniqueCards: 2, valueEur: 7.5, unpricedCards: 4 });
  });
});
