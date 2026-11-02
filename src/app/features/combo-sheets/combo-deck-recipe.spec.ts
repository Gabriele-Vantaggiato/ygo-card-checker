import { Decklist } from '../../models/decklist.model';
import { parseYdkeUrl } from '../../services/ydke.service';
import { isComboSheet } from './combo-sheet.model';
import { ComboDeckRecipe, isComboDeckRecipe, matchDeckRecipes } from './combo-deck-recipe';
import { generateComboSheet } from './combo-sheet-generation';

describe('Dynamic Zombie combo recipes against the real supplied YDKE', () => {
  let deck: Decklist, recipes: ComboDeckRecipe[];
  beforeAll(async () => {
    const [raw, data] = await Promise.all([
      fetch('/test-fixtures/combo-sheets/user-deck.ydke').then(r => r.text()),
      fetch('/assets/data/combo-sheets/deck-recipes.json').then(r => r.json()),
    ]);
    recipes = data;
    const sections = parseYdkeUrl(raw);
    deck = { id: 'real-zombie', name: 'User Zombie deck', updatedAt: '2026-11-02', cards: [] };
    for (const section of ['main', 'extra', 'side'] as const) {
      const counts = new Map<number, number>();
      for (const id of sections[section]) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const [id, quantity] of counts) deck.cards.push({ id, quantity, section, name: `Card ${id}`, type: 'Monster', imageUrlSmall: null });
    }
    expect([sections.main.length, sections.extra.length, sections.side.length]).toEqual([42, 15, 15]);
  });
  it('validates every recipe and generates ten native-compatible concrete routes', () => {
    expect(recipes.length).toBe(10);
    expect(recipes.every(isComboDeckRecipe)).toBeTrue();
    const result = generateComboSheet(deck, { version: 1, generatedAt: '', cardCount: 0, scripts: {} }, [], null, 'HAT', true, recipes);
    expect(result.templates).toBe(10);
    expect(isComboSheet(result.sheet)).toBeTrue();
    expect(result.sheet!.tabs[0].combos.every(g => g.steps.length >= 2 && g.endFlow?.length)).toBeTrue();
  });
  it('removes the Beelze routes when Beelze leaves Extra, without affecting other routes', () => {
    const changed = { ...deck, cards: deck.cards.filter(c => c.id !== 34408491) };
    const routes = matchDeckRecipes(changed, recipes);
    expect(routes.length).toBe(8);
    expect(routes.some(g => g.endCards.includes(34408491))).toBeFalse();
  });
  it('does not count Side Deck materials or missing Pain Painter as a complete Skull recipe', () => {
    const changed = structuredClone(deck);
    changed.cards.find(c => c.id === 21620076)!.section = 'side';
    expect(matchDeckRecipes(changed, recipes).some(g => g.endCards.includes(59969392))).toBeFalse();
  });
  it('keeps contextual resources in the correct final zones and opponent-board prerequisites explicit', () => {
    const routes = matchDeckRecipes(deck, recipes);
    const search = routes.find(g => g.id === 'recipe-foolish-goblin-5309481')!;
    expect(search.endFlow!.find(c => c.card === 92826944)!.zone).toBe('hand');
    const fusion = routes.find(g => g.id === 'recipe-world-superpoly-dragonecro')!;
    expect(fusion.description).toContain('già due mostri scoperti sul campo');
    expect(fusion.startingCards).toContain(0);
    const chain = routes.find(g => g.id === 'recipe-25259669-goblin-chain-mezuki')!;
    expect(chain.steps.some(s => s.text.includes('Goblin Zombie NON cerca'))).toBeTrue();
  });
  it('matches renamed and reordered decks, clones recipes, and rejects malformed requirements', () => {
    const renamed = { ...deck, name: 'Another deck', cards: [...deck.cards].reverse() };
    expect(matchDeckRecipes(renamed, recipes).length).toBe(10);
    const guide = matchDeckRecipes(deck, recipes)[0]; guide.steps[0].text = 'Changed';
    expect(recipes[0].guide.steps[0].text).not.toBe('Changed');
    expect(isComboDeckRecipe({ ...recipes[0], main: { '-1': 1 } })).toBeFalse();
    expect(isComboDeckRecipe({ ...recipes[0], extra: { '34408491': 0 } })).toBeFalse();
  });
  it('reserves search/send targets in the Deck and requires a real card for generic hand costs', () => {
    const recipe = recipes.find(r => r.key === 'foolish-goblin-5309481')!;
    const changed = { ...deck, cards: deck.cards.filter(c => [81439173, 63665875, 33420078, 92826944, 5309481].includes(c.id)).map(c => ({ ...c, quantity: 1 })) };
    // Foolish + Goblin in hand, Plague + Mezuki reserved in Deck: no fifth card to pay the topdeck cost.
    expect(matchDeckRecipes(changed, [recipe])).toEqual([]);
    changed.cards.find(c => c.id === 63665875)!.quantity = 2;
    expect(matchDeckRecipes(changed, [recipe]).length).toBe(1);
  });
});
