import { Injectable } from '@angular/core';
import {
  AddToDecklistPayload,
  Decklist,
  DecklistCard,
  DecklistStorage,
  DeckSection,
  maxCopiesForStatus,
} from '../models/decklist.model';
import { applyDeckCopyDrop, sortDeckCards } from '../utils/deck-card.utils';
import { canPlaceCardInSection } from '../utils/deck-section.utils';
import { resolveDeckSection } from './ydke.service';

const STORAGE_KEY = 'ygo-checker-decklists';

@Injectable({ providedIn: 'root' })
export class DecklistService {
  load(): DecklistStorage {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this.emptyStorage();
      }
      const parsed = JSON.parse(raw) as DecklistStorage;
      if (!Array.isArray(parsed.decklists)) {
        return this.emptyStorage();
      }
      return {
        activeId: parsed.activeId ?? null,
        decklists: parsed.decklists,
      };
    } catch {
      return this.emptyStorage();
    }
  }

  save(storage: DecklistStorage): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    } catch {
      // quota / private mode
    }
  }

  createDecklist(name: string): Decklist {
    return {
      id: crypto.randomUUID(),
      name,
      updatedAt: new Date().toISOString(),
      cards: [],
    };
  }

  addCardToDecklist(decklist: Decklist, payload: AddToDecklistPayload, quantity = 1): Decklist {
    const max = maxCopiesForStatus(payload.banlistStatus);
    if (max === 0 || quantity <= 0) {
      return decklist;
    }

    // Banlist copy caps apply across every section combined, but each section keeps
    // its own entry — merging by id alone would silently relocate a side/extra add
    // into an existing main-section stack instead of filling the section it targets.
    const totalExisting = decklist.cards
      .filter((c) => c.id === payload.id)
      .reduce((sum, c) => sum + c.quantity, 0);
    const addable = Math.min(quantity, max - totalExisting);
    if (addable <= 0) {
      return decklist;
    }

    const targetSection = resolveDeckSection({ type: payload.type, section: payload.section });
    const existing = decklist.cards.find(
      (c) => c.id === payload.id && resolveDeckSection(c) === targetSection,
    );

    if (existing) {
      return {
        ...decklist,
        updatedAt: new Date().toISOString(),
        cards: decklist.cards.map((c) =>
          c === existing
            ? {
                ...c,
                quantity: c.quantity + addable,
                name: payload.name,
                type: payload.type,
                imageUrlSmall: payload.imageUrlSmall ?? c.imageUrlSmall,
                banlistStatus: payload.banlistStatus ?? c.banlistStatus ?? null,
                legalityVerdict: payload.legalityVerdict ?? c.legalityVerdict ?? null,
              }
            : c,
        ),
      };
    }

    const nextCard: DecklistCard = {
      id: payload.id,
      name: payload.name,
      type: payload.type,
      imageUrlSmall: payload.imageUrlSmall,
      quantity: addable,
      section: payload.section ?? targetSection,
      banlistStatus: payload.banlistStatus ?? null,
      legalityVerdict: payload.legalityVerdict ?? null,
    };

    // Append at the end of the target section so DnD order of other cards is kept.
    const cards = [...decklist.cards];
    let insertAt = -1;
    for (let i = cards.length - 1; i >= 0; i--) {
      if (resolveDeckSection(cards[i]!) === targetSection) {
        insertAt = i + 1;
        break;
      }
    }
    if (insertAt < 0) {
      if (targetSection === 'main') {
        insertAt = 0;
      } else if (targetSection === 'extra') {
        insertAt = cards.reduce(
          (idx, c, i) => (resolveDeckSection(c) === 'main' ? i + 1 : idx),
          0,
        );
      } else {
        insertAt = cards.length;
      }
    }
    cards.splice(insertAt, 0, nextCard);

    return {
      ...decklist,
      updatedAt: new Date().toISOString(),
      cards,
    };
  }

  setCardQuantity(decklist: Decklist, cardId: number, quantity: number, max: number): Decklist {
    if (quantity <= 0) {
      return this.removeCard(decklist, cardId);
    }

    const capped = Math.min(quantity, max);
    return {
      ...decklist,
      updatedAt: new Date().toISOString(),
      cards: decklist.cards.map((c) => (c.id === cardId ? { ...c, quantity: capped } : c)),
    };
  }

  removeCard(decklist: Decklist, cardId: number): Decklist {
    return {
      ...decklist,
      updatedAt: new Date().toISOString(),
      cards: decklist.cards.filter((c) => c.id !== cardId),
    };
  }

  /**
   * Moves a single copy between Main / Extra / Side (appends to the end of the target).
   * Allows the same passcode in multiple sections as separate rows.
   * Preserves manual order — does not auto-sort.
   */
  moveOneCopyToSection(
    decklist: Decklist,
    cardId: number,
    fromSection: DeckSection,
    toSection: DeckSection,
  ): Decklist {
    if (fromSection === toSection) {
      return decklist;
    }

    const source = decklist.cards.find(
      (c) => c.id === cardId && resolveDeckSection(c) === fromSection,
    );
    if (!source || !canPlaceCardInSection(source.type, toSection)) {
      return decklist;
    }

    const fromPasscodes = decklist.cards
      .filter((c) => resolveDeckSection(c) === fromSection)
      .flatMap((c) => Array.from({ length: c.quantity }, () => c.id));
    const previousIndex = fromPasscodes.indexOf(cardId);
    if (previousIndex < 0) {
      return decklist;
    }

    const toCount = decklist.cards
      .filter((c) => resolveDeckSection(c) === toSection)
      .reduce((sum, c) => sum + c.quantity, 0);

    return this.setCards(
      decklist,
      applyDeckCopyDrop(decklist.cards, fromSection, toSection, previousIndex, toCount),
    );
  }

  /**
   * Drag-and-drop: reorder within a section or move a copy between sections at an index.
   * Preserves manual order — does not auto-sort.
   */
  applyCopyDrop(
    decklist: Decklist,
    fromSection: DeckSection,
    toSection: DeckSection,
    previousIndex: number,
    currentIndex: number,
  ): Decklist {
    if (fromSection !== toSection) {
      const fromPasscodes = decklist.cards
        .filter((c) => resolveDeckSection(c) === fromSection)
        .flatMap((c) => Array.from({ length: c.quantity }, () => c.id));
      const movingId = fromPasscodes[previousIndex];
      const moving = movingId != null ? decklist.cards.find((c) => c.id === movingId) : null;
      if (!moving || !canPlaceCardInSection(moving.type, toSection)) {
        return decklist;
      }
    }

    const nextCards = applyDeckCopyDrop(
      decklist.cards,
      fromSection,
      toSection,
      previousIndex,
      currentIndex,
    );
    if (nextCards === decklist.cards) {
      return decklist;
    }
    return this.setCards(decklist, nextCards);
  }

  /**
   * Replace cards preserving array order (DnD / manual layout).
   * Use `sortDecklist` only when the user explicitly asks to sort.
   */
  setCards(decklist: Decklist, cards: DecklistCard[]): Decklist {
    return {
      ...decklist,
      updatedAt: new Date().toISOString(),
      cards: cards.map((c) => ({ ...c })),
    };
  }

  totalCards(cards: DecklistCard[]): number {
    return cards.reduce((sum, c) => sum + c.quantity, 0);
  }

  sortCards(cards: DecklistCard[]): DecklistCard[] {
    return sortDeckCards(cards);
  }

  sortDecklist(decklist: Decklist): Decklist {
    return {
      ...decklist,
      updatedAt: new Date().toISOString(),
      cards: this.sortCards(decklist.cards),
    };
  }

  /** Same as setCards — order is part of the saved deck state. */
  replaceCards(decklist: Decklist, cards: DecklistCard[]): Decklist {
    return this.setCards(decklist, cards);
  }

  mergeCards(decklist: Decklist, imported: readonly DecklistCard[]): Decklist {
    return imported.reduce((deck, card) => {
      const existing = deck.cards.find((item) => item.id === card.id);
      if (!existing) {
        return this.addCardToDecklist(deck, card, card.quantity);
      }
      const max = maxCopiesForStatus(card.banlistStatus);
      const nextQty = Math.min(existing.quantity + card.quantity, max);
      return {
        ...deck,
        updatedAt: new Date().toISOString(),
        cards: deck.cards.map((item) =>
          item.id === card.id
            ? {
                ...item,
                quantity: nextQty,
                section: card.section ?? item.section,
                name: card.name,
                type: card.type,
                imageUrlSmall: card.imageUrlSmall ?? item.imageUrlSmall,
                banlistStatus: card.banlistStatus ?? item.banlistStatus ?? null,
                legalityVerdict: card.legalityVerdict ?? item.legalityVerdict ?? null,
              }
            : item,
        ),
      };
    }, decklist);
  }

  private emptyStorage(): DecklistStorage {
    return { activeId: null, decklists: [] };
  }
}
