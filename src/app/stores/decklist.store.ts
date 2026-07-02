import { Injectable, computed, inject, signal } from '@angular/core';
import { BanlistStatus } from '../models/ygo-format.model';
import {
  AddToDecklistPayload,
  Decklist,
  DecklistStorage,
  maxCopiesForStatus,
} from '../models/decklist.model';
import { DecklistService } from '../services/decklist.service';
import { I18nService } from '../services/i18n.service';

export type DecklistFeedback = 'added' | 'maxReached' | 'forbidden' | 'noDecklist';

@Injectable({ providedIn: 'root' })
export class DecklistStore {
  private readonly decklistService = inject(DecklistService);
  private readonly i18n = inject(I18nService);

  private readonly storage = signal(this.decklistService.load());
  readonly feedback = signal<DecklistFeedback | null>(null);

  readonly decklists = computed(() => this.storage().decklists);
  readonly activeDecklistId = computed(() => this.storage().activeId);

  readonly activeDecklist = computed(() => {
    const { decklists, activeId } = this.storage();
    return decklists.find((d) => d.id === activeId) ?? decklists[0] ?? null;
  });

  readonly activeTotalCards = computed(() => {
    const deck = this.activeDecklist();
    return deck ? this.decklistService.totalCards(deck.cards) : 0;
  });

  constructor() {
    if (this.storage().decklists.length === 0) {
      this.bootstrapDefaultDecklist();
    } else if (!this.storage().activeId) {
      this.patchStorage((s) => ({ ...s, activeId: s.decklists[0]?.id ?? null }));
    }
  }

  setActiveDecklist(id: string): void {
    this.patchStorage((s) => ({ ...s, activeId: id }));
    this.feedback.set(null);
  }

  createDecklist(name?: string): void {
    const deck = this.decklistService.createDecklist(
      name?.trim() || this.i18n.t('decklist.defaultName', { n: String(this.storage().decklists.length + 1) }),
    );
    this.patchStorage((s) => ({
      activeId: deck.id,
      decklists: [deck, ...s.decklists],
    }));
  }

  renameActiveDecklist(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const activeId = this.activeDecklistId();
    if (!activeId) {
      return;
    }
    this.patchStorage((s) => ({
      ...s,
      decklists: s.decklists.map((d) =>
        d.id === activeId ? { ...d, name: trimmed, updatedAt: new Date().toISOString() } : d,
      ),
    }));
  }

  deleteActiveDecklist(): void {
    const activeId = this.activeDecklistId();
    if (!activeId) {
      return;
    }
    this.patchStorage((s) => {
      const decklists = s.decklists.filter((d) => d.id !== activeId);
      if (decklists.length === 0) {
        const deck = this.decklistService.createDecklist(this.i18n.t('decklist.defaultName', { n: '1' }));
        return { activeId: deck.id, decklists: [deck] };
      }
      return { activeId: decklists[0]!.id, decklists };
    });
  }

  addCard(payload: AddToDecklistPayload): void {
    const deck = this.activeDecklist();
    if (!deck) {
      this.flashFeedback('noDecklist');
      return;
    }

    const max = maxCopiesForStatus(payload.banlistStatus);
    if (max === 0) {
      this.flashFeedback('forbidden');
      return;
    }

    const current = deck.cards.find((c) => c.id === payload.id)?.quantity ?? 0;
    if (current >= max) {
      this.flashFeedback('maxReached');
      return;
    }

    const updated = this.decklistService.addCardToDecklist(deck, payload);
    this.replaceDeck(updated);
    this.flashFeedback('added');
  }

  removeCard(cardId: number): void {
    const deck = this.activeDecklist();
    if (!deck) {
      return;
    }
    this.replaceDeck(this.decklistService.removeCard(deck, cardId));
  }

  incrementCard(cardId: number, banlistStatus: BanlistStatus | null = null): void {
    const deck = this.activeDecklist();
    if (!deck) {
      return;
    }
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) {
      return;
    }
    const max = maxCopiesForStatus(banlistStatus);
    if (card.quantity >= max) {
      this.flashFeedback('maxReached');
      return;
    }
    this.replaceDeck(
      this.decklistService.setCardQuantity(deck, cardId, card.quantity + 1, max),
    );
  }

  decrementCard(cardId: number, banlistStatus: BanlistStatus | null = null): void {
    const deck = this.activeDecklist();
    if (!deck) {
      return;
    }
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) {
      return;
    }
    const max = maxCopiesForStatus(banlistStatus);
    this.replaceDeck(
      this.decklistService.setCardQuantity(deck, cardId, card.quantity - 1, max),
    );
  }

  quantityInActive(cardId: number): number {
    return this.activeDecklist()?.cards.find((c) => c.id === cardId)?.quantity ?? 0;
  }

  canAdd(payload: AddToDecklistPayload): boolean {
    const max = maxCopiesForStatus(payload.banlistStatus);
    if (max === 0) {
      return false;
    }
    return this.quantityInActive(payload.id) < max;
  }

  clearFeedback(): void {
    this.feedback.set(null);
  }

  private bootstrapDefaultDecklist(): void {
    const deck = this.decklistService.createDecklist(this.i18n.t('decklist.defaultName', { n: '1' }));
    this.storage.set({ activeId: deck.id, decklists: [deck] });
    this.persist();
  }

  private replaceDeck(updated: Decklist): void {
    this.patchStorage((s) => ({
      ...s,
      decklists: s.decklists.map((d) => (d.id === updated.id ? updated : d)),
    }));
  }

  private patchStorage(mutate: (storage: DecklistStorage) => DecklistStorage): void {
    this.storage.update((s) => mutate(s));
    this.persist();
  }

  private persist(): void {
    this.decklistService.save(this.storage());
  }

  private flashFeedback(kind: DecklistFeedback): void {
    this.feedback.set(kind);
    window.setTimeout(() => {
      if (this.feedback() === kind) {
        this.feedback.set(null);
      }
    }, 2200);
  }
}
