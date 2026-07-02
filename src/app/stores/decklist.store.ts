import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BanlistStatus } from '../models/ygo-format.model';
import {
  AddToDecklistPayload,
  Decklist,
  DecklistCard,
  DecklistStorage,
  DeckSection,
  maxCopiesForStatus,
} from '../models/decklist.model';
import { DecklistService } from '../services/decklist.service';
import { CardLegalityFacade } from '../services/card-legality.facade';
import { I18nService } from '../services/i18n.service';
import { YgoApiService } from '../services/ygo-api.service';
import { YdkeService, YdkeSections, passcodesToQuantityMap } from '../services/ydke.service';
import { YgoFormat } from '../models/ygo-format.model';
import { YgoCard, LegalityResult } from '../models/ygo-card.model';
import { DeckCompletionPlan } from '../models/deck-completion.model';

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
    this.replaceDeck(this.decklistService.sortDecklist(updated));
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

  importFromYdke(text: string, deckId: string, replace: boolean, format: YgoFormat): void {
    this.importFromYdke$(text, deckId, replace, format).subscribe((result) => {
      if (!result.ok) {
        this.flashFeedback({ key: result.errorKey ?? 'decklist.feedback.ydkeResolveFailed', tone: 'warning' });
        return;
      }
      this.flashFeedback({
        key: 'decklist.feedback.ydkeImported',
        params: {
          total: `${result.total}`,
          unique: `${result.unique}`,
        },
        tone: 'success',
      });
    });
  }

  importFromYdke$(
    text: string,
    deckId: string,
    replace: boolean,
    format: YgoFormat,
  ): Observable<{ ok: boolean; total: number; unique: number; errorKey?: string }> {
    let sections: YdkeSections;
    try {
      sections = this.ydkeService.parseUrl(text);
    } catch {
      return of({ ok: false, total: 0, unique: 0, errorKey: 'decklist.feedback.ydkeInvalid' });
    }

    const total = sections.main.length + sections.extra.length + sections.side.length;
    if (total === 0) {
      return of({ ok: false, total: 0, unique: 0, errorKey: 'decklist.feedback.ydkeEmpty' });
    }

    const deck = this.getDeckById(deckId);
    if (!deck) {
      return of({ ok: false, total: 0, unique: 0, errorKey: 'decklist.feedback.noDecklist' });
    }

    const sectionEntries: Array<{ section: DeckSection; quantities: Map<number, number> }> = [
      { section: 'main', quantities: passcodesToQuantityMap(sections.main) },
      { section: 'extra', quantities: passcodesToQuantityMap(sections.extra) },
      { section: 'side', quantities: passcodesToQuantityMap(sections.side) },
    ];

    const uniqueIds = [
      ...new Set(sectionEntries.flatMap((entry) => [...entry.quantities.keys()])),
    ];

    return this.ygoApi.getCardsByIds$(uniqueIds, 'en').pipe(
      switchMap((cards) => {
        const cardById = new Map(cards.map((card) => [card.id, card]));
        if (cards.length === 0) {
          return of({ ok: false, total: 0, unique: 0, errorKey: 'decklist.feedback.ydkeResolveFailed' });
        }
        return this.cardLegality.evaluateMany$(cards, format).pipe(
          map((legality) => {
            const imported = this.buildImportedCards(sectionEntries, cardById, legality);
            if (imported.length === 0) {
              return { ok: false, total: 0, unique: 0, errorKey: 'decklist.feedback.ydkeResolveFailed' };
            }

            const updated = replace
              ? this.decklistService.replaceCards(deck, imported)
              : this.decklistService.mergeCards(deck, imported);
            const sorted = this.decklistService.sortDecklist(updated);
            this.replaceDeck(sorted);
            this.patchStorage((s) => ({ ...s, activeId: deckId }));

            return {
              ok: true,
              total: this.decklistService.totalCards(sorted.cards),
              unique: sorted.cards.length,
            };
          }),
        );
      }),
      catchError(() => of({ ok: false, total: 0, unique: 0, errorKey: 'decklist.feedback.ydkeResolveFailed' })),
    );
  }

  notify(message: DecklistFeedbackMessage): void {
    this.flashFeedback(message);
  }

  applyCompletionPlan(deckId: string, plan: DeckCompletionPlan): boolean {
    if (plan.status !== 'ready' || plan.adds.length === 0) {
      return false;
    }

    const deck = this.getDeckById(deckId);
    if (!deck) {
      this.flashFeedback({ key: 'decklist.feedback.noDecklist', tone: 'info' });
      return false;
    }

    let updated = deck;
    for (const add of plan.adds) {
      const payload = plan.payloads.find((item) => item.id === add.cardId);
      if (!payload) {
        continue;
      }
      updated = this.decklistService.addCardToDecklist(updated, payload, add.quantity);
    }

    this.replaceDeck(this.decklistService.sortDecklist(updated));
    this.patchStorage((s) => ({ ...s, activeId: deckId }));

    const totalAdded = plan.adds.reduce((sum, add) => sum + add.quantity, 0);
    this.flashFeedback({
      key: 'decklist.feedback.completionApplied',
      params: {
        count: `${totalAdded}`,
        unique: `${plan.adds.length}`,
      },
      tone: 'success',
    });
    return true;
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
              return of({
                id: card.id,
                banlistStatus: card.banlistStatus ?? null,
                legalityVerdict: card.legalityVerdict ?? null,
              });
            }
            return this.cardLegality.evaluate$(full, format).pipe(
              map((result) => ({
                id: card.id,
                banlistStatus: result.banlistStatus,
                legalityVerdict: result.verdict,
              })),
            );
          }),
        ),
      ),
    ).subscribe((updates) => {
      const byId = new Map(updates.map((item) => [item.id, item]));
      const updated = {
        ...deck,
        updatedAt: new Date().toISOString(),
        cards: deck.cards.map((card) => {
          const update = byId.get(card.id);
          if (!update) {
            return card;
          }
          return {
            ...card,
            banlistStatus: update.banlistStatus ?? card.banlistStatus ?? null,
            legalityVerdict: update.legalityVerdict ?? card.legalityVerdict ?? null,
          };
        }),
      };
      this.replaceDeck(this.decklistService.sortDecklist(updated));
    });
  }

  removeOneCopy(cardId: number): void {
    const deck = this.activeDecklist();
    if (!deck) {
      return;
    }
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) {
      return;
    }
    if (card.quantity <= 1) {
      this.removeCard(cardId);
      return;
    }
    this.decrementCard(cardId, card.banlistStatus ?? null);
  }

  private buildImportedCards(
    sectionEntries: Array<{ section: DeckSection; quantities: Map<number, number> }>,
    cardById: Map<number, YgoCard>,
    legality: Map<number, LegalityResult>,
  ): DecklistCard[] {
    const merged = new Map<number, DecklistCard>();

    for (const { section, quantities } of sectionEntries) {
      for (const [passcode, quantity] of quantities) {
        const card = cardById.get(passcode);
        if (!card) {
          continue;
        }
        const verdict = legality.get(card.id);
        const banlistStatus = verdict?.banlistStatus ?? card.banlist_info?.ban_tcg ?? null;
        const max = maxCopiesForStatus(banlistStatus);
        if (max === 0) {
          continue;
        }

        const existing = merged.get(card.id);
        const nextQty = Math.min((existing?.quantity ?? 0) + quantity, max);
        merged.set(card.id, {
          id: card.id,
          name: card.name,
          type: card.type,
          imageUrlSmall: card.card_images[0]?.image_url_small ?? null,
          quantity: nextQty,
          section,
          banlistStatus,
          legalityVerdict: verdict?.verdict ?? null,
        });
      }
    }

    return [...merged.values()];
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
