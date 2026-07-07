import { Decklist, DecklistStorage } from '../../../models/decklist.model';

export function mergeDeckStorage(local: DecklistStorage, remote: readonly Decklist[]): DecklistStorage {
  const merged = new Map<string, Decklist>();

  for (const deck of local.decklists) {
    merged.set(deck.id, deck);
  }

  for (const deck of remote) {
    const existing = merged.get(deck.id);
    if (!existing || Date.parse(deck.updatedAt) > Date.parse(existing.updatedAt)) {
      merged.set(deck.id, deck);
    }
  }

  const decklists = [...merged.values()].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );

  const activeId =
    local.activeId && decklists.some((deck) => deck.id === local.activeId)
      ? local.activeId
      : (decklists[0]?.id ?? null);

  return { activeId, decklists };
}
