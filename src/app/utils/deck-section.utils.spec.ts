import { canPlaceCardInSection } from './deck-section.utils';

describe('canPlaceCardInSection', () => {
  it('rejects an Extra Deck monster in Main', () => {
    expect(canPlaceCardInSection('Link Monster', 'main')).toBeFalse();
  });

  it('rejects a Main Deck card in Extra', () => {
    expect(canPlaceCardInSection('Effect Monster', 'extra')).toBeFalse();
  });

  it('accepts an Extra Deck monster in Extra', () => {
    expect(canPlaceCardInSection('Synchro Monster', 'extra')).toBeTrue();
  });

  it('accepts both Main and Extra Deck card types in Side', () => {
    expect(canPlaceCardInSection('Effect Monster', 'side')).toBeTrue();
    expect(canPlaceCardInSection('XYZ Monster', 'side')).toBeTrue();
  });
});
