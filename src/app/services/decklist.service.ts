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

  addCardToDecklist(decklist: Decklist, payload: AddToDecklistPayload, quantity = 1): Decklist {
    const max = maxCopiesForStatus(payload.banlistStatus);
    if (max === 0 || quantity <= 0) {
      return decklist;
    }

    const existing = decklist.cards.find((c) => c.id === payload.id);
    const current = existing?.quantity ?? 0;
    const nextQty = Math.min(current + quantity, max);

    if (nextQty <= current) {
      return decklist;
    }

    if (existing) {
      return {
        ...decklist,
        updatedAt: new Date().toISOString(),
        cards: decklist.cards.map((c) =>
          c.id === payload.id
            ? {
                ...c,
                quantity: nextQty,
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
          quantity: Math.min(quantity, max),
          banlistStatus: payload.banlistStatus ?? null,
          legalityVerdict: payload.legalityVerdict ?? null,
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

  sortCards(cards: DecklistCard[]): DecklistCard[] {
    const TYPE_RANK = (type: string): number => {
      if (/Fusion|Synchro|Synchron|Xyz|XYZ|Link/i.test(type)) {
        return 0;
      }
      if (/Monster/i.test(type)) {
        return 1;
      }
      if (/Spell/i.test(type)) {
        return 2;
      }
      if (/Trap/i.test(type)) {
        return 3;
      }
      return 4;
    };

    return [...cards].sort((a, b) => {
      const rank = TYPE_RANK(a.type) - TYPE_RANK(b.type);
      if (rank !== 0) {
        return rank;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  sortDecklist(decklist: Decklist): Decklist {
    return {
      ...decklist,
      updatedAt: new Date().toISOString(),
      cards: this.sortCards(decklist.cards),
    };
  }

  private emptyStorage(): DecklistStorage {
    return { activeId: null, decklists: [] };
  }
}
