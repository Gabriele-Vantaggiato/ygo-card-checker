/**
 * Summoning mechanics that did not exist yet in a retro format. Card pool dates alone cannot catch
 * these (e.g. a Pendulum card dated inside the HAT window), so legality checks, the deck roulette and
 * the deck check all use this one table. Must mirror BANNED_MECHANICS in
 * scripts/build-deck-roulette-pool.mjs (build-time filter of the pool).
 */
export type Mechanic = 'synchro' | 'xyz' | 'pendulum' | 'link';

export const FORMAT_BANNED_MECHANICS: Readonly<Record<string, readonly Mechanic[]>> = {
  goat: ['synchro', 'xyz', 'pendulum', 'link'],
  edison: ['xyz', 'pendulum', 'link'],
  tengu: ['pendulum', 'link'],
  hat: ['pendulum', 'link'],
};

/** The mechanic a card belongs to, from its YGOPRODeck type line, or null for ordinary cards. */
export function mechanicOfType(type: string | null | undefined): Mechanic | null {
  if (!type) return null;
  if (/Pendulum/i.test(type)) return 'pendulum';
  if (/Link/i.test(type)) return 'link';
  if (/XYZ/i.test(type)) return 'xyz';
  if (/Synchro/i.test(type)) return 'synchro';
  return null;
}

/** The banned mechanic of this card in the format, or null when the card is allowed. */
export function bannedMechanicFor(formatId: string, type: string | null | undefined): Mechanic | null {
  const mechanic = mechanicOfType(type);
  return mechanic && (FORMAT_BANNED_MECHANICS[formatId] ?? []).includes(mechanic) ? mechanic : null;
}

export const MECHANIC_LABEL: Readonly<Record<Mechanic, string>> = {
  synchro: 'Synchro',
  xyz: 'Xyz',
  pendulum: 'Pendulum',
  link: 'Link',
};
