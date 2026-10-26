import { CollectionDraft, CollectionItem } from '../models/collection.model';
import { YgoCard } from '../models/ygo-card.model';

export type CollectionItemPatch = Partial<Omit<CollectionItem, 'id' | 'updatedAt'>>;

export function collectionKey(
  i: Pick<CollectionDraft, 'setCode' | 'rarity' | 'language' | 'condition' | 'firstEdition'>,
): string {
  return [i.setCode, i.rarity, i.language, i.condition, i.firstEdition ? '1' : '0'].join('|');
}

/** Adds `incoming` to the list, summing quantity when the printing already exists. */
export function mergeDraft<T extends CollectionDraft>(list: readonly T[], incoming: T): T[] {
  const key = collectionKey(incoming);
  const index = list.findIndex((entry) => collectionKey(entry) === key);
  if (index === -1) {
    return [...list, incoming];
  }
  return list.map((entry, i) => (i === index ? { ...entry, quantity: entry.quantity + incoming.quantity } : entry));
}

export function applyItemPatch(
  items: readonly CollectionItem[],
  id: string,
  patch: CollectionItemPatch,
  now: string,
): { items: CollectionItem[]; touchedId: string; removedId: string | null } | null {
  const current = items.find((i) => i.id === id);
  if (!current) {
    return null;
  }
  const updated: CollectionItem = { ...current, ...patch, updatedAt: now };
  const twin = items.find((i) => i.id !== id && collectionKey(i) === collectionKey(updated));
  if (!twin) {
    return { items: items.map((i) => (i.id === id ? updated : i)), touchedId: id, removedId: null };
  }
  const merged: CollectionItem = { ...twin, quantity: twin.quantity + updated.quantity, updatedAt: now };
  return {
    items: items.filter((i) => i.id !== id).map((i) => (i.id === twin.id ? merged : i)),
    touchedId: twin.id,
    removedId: id,
  };
}

/** Cardmarket price in EUR (per card, not per printing); `0.00`/missing ⇒ null. */
export function extractCardmarketEur(card: YgoCard): number | null {
  const raw = card.card_prices?.[0]?.cardmarket_price;
  const value = raw === undefined ? NaN : Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface CollectionTotals {
  totalCards: number;
  uniqueCards: number;
  valueEur: number;
  /** Copies owned whose price is unknown (not counted in `valueEur`). */
  unpricedCards: number;
}

export function collectionTotals(
  items: readonly CollectionItem[],
  prices: ReadonlyMap<number, number | null>,
): CollectionTotals {
  let totalCards = 0;
  let valueEur = 0;
  let unpricedCards = 0;
  const unique = new Set<number>();
  for (const item of items) {
    totalCards += item.quantity;
    unique.add(item.passcode);
    const price = prices.get(item.passcode) ?? null;
    if (price === null) {
      unpricedCards += item.quantity;
    } else {
      valueEur += price * item.quantity;
    }
  }
  return { totalCards, uniqueCards: unique.size, valueEur, unpricedCards };
}
