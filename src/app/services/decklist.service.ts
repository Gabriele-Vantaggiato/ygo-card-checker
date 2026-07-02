import { Injectable } from '@angular/core';
import {
  AddToDecklistPayload,
  Decklist,
  DecklistCard,
  DecklistStorage,
  maxCopiesForStatus,
} from '../models/decklist.model';

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

  addCardToDecklist(decklist: Decklist, payload: AddToDecklistPayload): Decklist {
    const max = maxCopiesForStatus(payload.banlistStatus);
    if (max === 0) {
      return decklist;
    }

    const existing = decklist.cards.find((c) => c.id === payload.id);
    if (existing) {
      const nextQty = Math.min(existing.quantity + 1, max);
      return {
        ...decklist,
        updatedAt: new Date().toISOString(),
        cards: decklist.cards.map((c) =>
          c.id === payload.id ? { ...c, quantity: nextQty, name: payload.name, type: payload.type } : c,
        ),
      };
    }

    return {
      ...decklist,
      updatedAt: new Date().toISOString(),
      cards: [
        ...decklist.cards,
        {
          id: payload.id,
          name: payload.name,
          type: payload.type,
          imageUrlSmall: payload.imageUrlSmall,
          quantity: 1,
        },
      ],
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

  totalCards(cards: DecklistCard[]): number {
    return cards.reduce((sum, c) => sum + c.quantity, 0);
  }

  private emptyStorage(): DecklistStorage {
    return { activeId: null, decklists: [] };
  }
}
