import { Decklist } from '../models/decklist.model';
import { DecklistService } from './decklist.service';

describe('DecklistService.moveOneCopyToSection', () => {
  const service = new DecklistService();

  function deckWith(cards: Decklist['cards']): Decklist {
    return {
      id: 'd1',
      name: 'Test',
      updatedAt: '2026-01-01',
      cards,
    };
  }

  it('moves one main copy to side and keeps remaining copies in main', () => {
    const deck = deckWith([
      {
        id: 1,
        name: 'Ash',
        type: 'Effect Monster',
        imageUrlSmall: null,
        quantity: 3,
        section: 'main',
      },
    ]);

    const next = service.moveOneCopyToSection(deck, 1, 'main', 'side');
    const main = next.cards.find((c) => c.section === 'main');
    const side = next.cards.find((c) => c.section === 'side');

    expect(main?.quantity).toBe(2);
    expect(side?.quantity).toBe(1);
    expect(side?.id).toBe(1);
  });

  it('rejects moving a main monster into extra', () => {
    const deck = deckWith([
      {
        id: 2,
        name: 'Ash',
        type: 'Effect Monster',
        imageUrlSmall: null,
        quantity: 1,
        section: 'main',
      },
    ]);

    const next = service.moveOneCopyToSection(deck, 2, 'main', 'extra');
    expect(next).toBe(deck);
  });

  it('allows moving an extra deck monster to side', () => {
    const deck = deckWith([
      {
        id: 3,
        name: 'Accesscode',
        type: 'Link Monster',
        imageUrlSmall: null,
        quantity: 1,
        section: 'extra',
      },
    ]);

    const next = service.moveOneCopyToSection(deck, 3, 'extra', 'side');
    expect(next.cards).toEqual([
      jasmine.objectContaining({ id: 3, quantity: 1, section: 'side' }),
    ]);
  });
});
