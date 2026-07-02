import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { BanlistStatus } from '../models/ygo-format.model';
import {
  AddToDecklistPayload,
  Decklist,
  DecklistStorage,
  maxCopiesForStatus,
} from '../models/decklist.model';
import { DecklistService } from '../services/decklist.service';
import { CardLegalityFacade } from '../services/card-legality.facade';
import { I18nService } from '../services/i18n.service';
import { YgoApiService } from '../services/ygo-api.service';
import { YdkeService } from '../services/ydke.service';
import { YgoFormat } from '../models/ygo-format.model';

export interface DecklistFeedbackMessage {
  key: string;
  params?: Record<string, string>;
  tone: 'success' | 'warning' | 'info';
}

@Injectable({ providedIn: 'root' })
export class DecklistStore {
  private readonly decklistService = inject(DecklistService);
  private readonly i18n = inject(I18nService);
  private readonly ydkeService = inject(YdkeService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);

  private readonly storage = signal(this.decklistService.load());
  readonly feedback = signal<DecklistFeedbackMessage | null>(null);

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

  createDecklist(name?: string): string {
    const deck = this.decklistService.createDecklist(
      name?.trim() || this.i18n.t('decklist.defaultName', { n: `${this.storage().decklists.length + 1}` }),
    );
    this.patchStorage((s) => ({
      activeId: deck.id,
      decklists: [deck, ...s.decklists],
    }));
    this.flashFeedback({
      key: 'decklist.feedback.created',
      params: { name: deck.name },
      tone: 'success',
    });
    return deck.id;
  }

  renameDecklist(deckId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    this.patchStorage((s) => ({
      ...s,
      decklists: s.decklists.map((d) =>
        d.id === deckId ? { ...d, name: trimmed, updatedAt: new Date().toISOString() } : d,
      ),
    }));
  }

  renameActiveDecklist(name: string): void {
    const activeId = this.activeDecklistId();
    if (!activeId) {
      return;
    }
    this.renameDecklist(activeId, name);
  }

  deleteActiveDecklist(): void {
    const activeId = this.activeDecklistId();
    if (!activeId) {
      return;
    }
    this.deleteDecklist(activeId);
  }

  deleteDecklist(deckId: string): void {
    this.patchStorage((s) => {
      const decklists = s.decklists.filter((d) => d.id !== deckId);
      if (decklists.length === 0) {
        const deck = this.decklistService.createDecklist(this.i18n.t('decklist.defaultName', { n: '1' }));
        return { activeId: deck.id, decklists: [deck] };
      }
      const activeId = s.activeId === deckId ? decklists[0]!.id : s.activeId;
      return { activeId, decklists };
    });
  }

  sortActiveDeck(): void {
    const deck = this.activeDecklist();
    if (!deck) {
      return;
    }
    this.replaceDeck(this.decklistService.sortDecklist(deck));
    this.flashFeedback({ key: 'decklist.feedback.sorted', tone: 'success' });
  }

  addCard(payload: AddToDecklistPayload, quantity = 1): void {
    const deckId = this.activeDecklistId();
    if (!deckId) {
      this.flashFeedback({ key: 'decklist.feedback.noDecklist', tone: 'info' });
      return;
    }
    this.addCardToDeck(deckId, payload, quantity);
  }

  addCardToDeck(deckId: string, payload: AddToDecklistPayload, quantity: number): boolean {
    const deck = this.getDeckById(deckId);
    if (!deck) {
      this.flashFeedback({ key: 'decklist.feedback.noDecklist', tone: 'info' });
      return false;
    }

    const max = maxCopiesForStatus(payload.banlistStatus);
    if (max === 0) {
      this.flashFeedback({ key: 'decklist.feedback.forbidden', tone: 'warning' });
      return false;
    }

    const current = this.quantityInDeck(deckId, payload.id);
    const allowed = max - current;
    if (allowed <= 0) {
      this.flashFeedback({ key: 'decklist.feedback.maxReached', tone: 'warning' });
      return false;
    }

    const addQty = Math.min(Math.max(1, quantity), allowed);
    const updated = this.decklistService.addCardToDecklist(deck, payload, addQty);
    this.replaceDeck(updated);
    this.patchStorage((s) => ({ ...s, activeId: deckId }));

    this.flashFeedback({
      key: 'decklist.feedback.addedTo',
      params: { qty: `${addQty}`, card: payload.name, deck: deck.name },
      tone: 'success',
    });
    return true;
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
    const max = maxCopiesForStatus(banlistStatus ?? card.banlistStatus);
    if (card.quantity >= max) {
      this.flashFeedback({ key: 'decklist.feedback.maxReached', tone: 'warning' });
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
    const max = maxCopiesForStatus(banlistStatus ?? card.banlistStatus);
    this.replaceDeck(
      this.decklistService.setCardQuantity(deck, cardId, card.quantity - 1, max),
    );
  }

  totalCardsForDeck(deckId: string): number {
    const deck = this.getDeckById(deckId);
    return deck ? this.decklistService.totalCards(deck.cards) : 0;
  }

  uniqueCardsForDeck(deckId: string): number {
    return this.getDeckById(deckId)?.cards.length ?? 0;
  }

  getDeckById(deckId: string): Decklist | null {
    return this.storage().decklists.find((d) => d.id === deckId) ?? null;
  }

  quantityInDeck(deckId: string, cardId: number): number {
    return this.getDeckById(deckId)?.cards.find((c) => c.id === cardId)?.quantity ?? 0;
  }

  quantityInActive(cardId: number): number {
    const activeId = this.activeDecklistId();
    return activeId ? this.quantityInDeck(activeId, cardId) : 0;
  }

  remainingCopies(deckId: string, cardId: number, banlistStatus: BanlistStatus | null | undefined): number {
    const max = maxCopiesForStatus(banlistStatus);
    return Math.max(0, max - this.quantityInDeck(deckId, cardId));
  }

  maxCopies(banlistStatus: BanlistStatus | null | undefined): number {
    return maxCopiesForStatus(banlistStatus);
  }

  canAddToDeck(deckId: string, cardId: number, banlistStatus: BanlistStatus | null | undefined): boolean {
    return this.remainingCopies(deckId, cardId, banlistStatus) > 0;
  }

  canAdd(payload: AddToDecklistPayload): boolean {
    const activeId = this.activeDecklistId();
    if (!activeId) {
      return false;
    }
    return this.canAddToDeck(activeId, payload.id, payload.banlistStatus);
  }

  clearFeedback(): void {
    this.feedback.set(null);
  }

  encodeYdke(deckId?: string): string | null {
    const deck = deckId ? this.getDeckById(deckId) : this.activeDecklist();
    if (!deck) {
      return null;
    }
    return this.ydkeService.encodeDeck(deck);
  }

  notify(message: DecklistFeedbackMessage): void {
    this.flashFeedback(message);
  }

  refreshActiveDeckLegality(format: YgoFormat): void {
    const deck = this.activeDecklist();
    if (!deck || deck.cards.length === 0) {
      return;
    }

    forkJoin(
      deck.cards.map((card) =>
        this.ygoApi.getCardById$(card.id, this.i18n.lang()).pipe(
          switchMap((full) => {
            if (!full) {
              return of({ id: card.id, banlistStatus: card.banlistStatus ?? null });
            }
            return this.cardLegality.evaluate$(full, format).pipe(
              map((result) => ({ id: card.id, banlistStatus: result.banlistStatus })),
            );
          }),
        ),
      ),
    ).subscribe((updates) => {
      const byId = new Map(updates.map((item) => [item.id, item.banlistStatus]));
      this.replaceDeck({
        ...deck,
        updatedAt: new Date().toISOString(),
        cards: deck.cards.map((card) => ({
          ...card,
          banlistStatus: byId.get(card.id) ?? card.banlistStatus ?? null,
        })),
      });
    });
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

  private flashFeedback(message: DecklistFeedbackMessage): void {
    this.feedback.set(message);
    window.setTimeout(() => {
      if (this.feedback() === message) {
        this.feedback.set(null);
      }
    }, 2800);
  }
}
