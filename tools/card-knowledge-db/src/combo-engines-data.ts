/**
 * Pillar 3 seed data. Curated by card NAME (resolved to ids at build time by
 * build-combo-engines.ts, same pattern as combo-flows-data.ts). Deliberately small
 * and conservative — a starting taxonomy to extend, not a competitive-tech dump.
 */

export interface EngineCardSeed {
  name: string;
  role: 'core' | 'support';
  minCopies: number;
}

export interface EngineSeed {
  key: string;
  name: string;
  description: string;
  minCardsThreshold: number;
  cards: EngineCardSeed[];
}

export const ENGINE_SEEDS: EngineSeed[] = [
  {
    key: 'artifact',
    name: 'Artifact',
    description: 'Artifact Sanctum-driven Fairy engine, splashable into most decks for a free negate/removal loop.',
    minCardsThreshold: 2,
    cards: [
      { name: 'Artifact Sanctum', role: 'core', minCopies: 1 },
      { name: 'Artifact Ignition', role: 'core', minCopies: 1 },
      { name: 'Artifact Achilleshield', role: 'support', minCopies: 1 },
      { name: 'Artifact Moralltach', role: 'support', minCopies: 1 },
      { name: 'Artifact Beagalltach', role: 'support', minCopies: 1 },
      { name: 'Artifact Lancea', role: 'support', minCopies: 1 },
    ],
  },
  {
    key: 'floowandereeze',
    name: 'Floowandereeze',
    description: 'Floowandereeze bird-tuner package: tempo-negate hand traps splashable for GY/Extra Deck disruption.',
    minCardsThreshold: 2,
    cards: [
      { name: 'Floowandereeze & Empen', role: 'core', minCopies: 1 },
      { name: 'Floowandereeze & Eglen', role: 'core', minCopies: 1 },
      { name: 'Floowandereeze & Robina', role: 'support', minCopies: 1 },
    ],
  },
];
