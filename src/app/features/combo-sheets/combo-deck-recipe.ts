import { Decklist } from '../../models/decklist.model';
import { resolveDeckSection } from '../../services/ydke.service';
import { ComboSheetGuide, isComboSheet } from './combo-sheet.model';

export interface ComboDeckRecipe {
  key: string;
  main: Record<string, number>;
  deck?: Record<string, number>;
  extra: Record<string, number>;
  guide: ComboSheetGuide;
}

export function isComboDeckRecipe(value: unknown): value is ComboDeckRecipe {
  if (!value || typeof value !== 'object') return false;
  const v = value as ComboDeckRecipe;
  const requirements = (r: unknown): boolean => !!r && typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length <= 100 &&
    Object.entries(r).every(([id, count]) => /^[1-9]\d{0,8}$/.test(id) && Number.isInteger(count) && count >= 1 && count <= 3);
  return typeof v.key === 'string' && v.key.length > 0 && v.key.length <= 120 && requirements(v.main) && requirements(v.extra) && (v.deck === undefined || requirements(v.deck)) &&
    isComboSheet({ schemaVersion: 1, id: 'recipe', title: 'recipe', author: '', accent: '', description: '', tags: [], tabs: [{ id: 'recipe', title: '', combos: [v.guide] }] });
}

/** Matches required sections/copies, independent of deck name, ordering or unrelated cards. */
export function matchDeckRecipes(deck: Decklist, recipes: readonly ComboDeckRecipe[]): ComboSheetGuide[] {
  const main = new Map<number, number>(), extra = new Map<number, number>();
  for (const card of deck.cards) {
    const section = resolveDeckSection(card);
    const quantities = section === 'main' ? main : section === 'extra' ? extra : null;
    if (quantities) quantities.set(card.id, (quantities.get(card.id) ?? 0) + card.quantity);
  }
  const enough = (required: Record<string, number>, quantities: Map<number, number>) => Object.entries(required).every(([id, count]) => (quantities.get(Number(id)) ?? 0) >= count);
  const seen = new Set<string>();
  return recipes.filter(recipe => {
    if (seen.has(recipe.key) || !enough(recipe.main, main) || !enough(recipe.extra, extra)) return false;
    // Every named card in the instruction diagrams must actually belong to Main/Extra.
    const g = recipe.guide;
    const referenced = [...g.startingCards, ...g.requiredCards, ...g.endCards, ...g.playsAround,
      ...(g.startFlow || []).map(c => c.card), ...(g.endFlow || []).map(c => c.card), ...g.steps.flatMap(s => [...s.cards, ...(s.flow || []).map(c => c.card)])];
    if (referenced.some(id => id && !main.has(id) && !extra.has(id))) return false;
    const hand = new Map<number, number>();
    for (const id of g.startingCards.filter(Boolean)) hand.set(id, (hand.get(id) ?? 0) + 1);
    if ([...hand].some(([id, count]) => (main.get(id) ?? 0) < count)) return false;
    const reservedInDeck = Object.entries(recipe.deck || {});
    if (reservedInDeck.some(([id, count]) => (main.get(Number(id)) ?? 0) - (hand.get(Number(id)) ?? 0) < count)) return false;
    const availableForGeneric = [...main.values()].reduce((n, count) => n + count, 0) -
      [...hand.values()].reduce((n, count) => n + count, 0) - reservedInDeck.reduce((n, [, count]) => n + count, 0);
    if (availableForGeneric < g.startingCards.filter(id => id === 0).length) return false;
    seen.add(recipe.key); return true;
  }).slice(0, 40).map(recipe => ({ ...structuredClone(recipe.guide), id: `recipe-${recipe.key}` }));
}
