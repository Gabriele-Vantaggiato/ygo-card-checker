/**
 * Pillar 4 seed data. A Flow gates on EITHER an engine key (resolved against
 * combo_engines.key) OR an explicit list of key card names — never both, matching
 * the spec's "linked to either an EngineId or specific CardIds".
 */

export interface FlowSeed {
  key: string;
  title: string;
  engineKey?: string;
  keyCardNames?: string[];
  steps: string[];
}

export const FLOW_SEEDS: FlowSeed[] = [
  {
    key: 'artifact-sanctum-loop',
    title: 'Artifact Sanctum negate loop',
    engineKey: 'artifact',
    steps: [
      'Activate Artifact Sanctum to Special Summon an Artifact from your Deck or GY as a Set card.',
      "During either player's turn, flip the Set Artifact face-up to trigger its effect (negate/destroy).",
      'Artifact Ignition sets another copy from your Deck, refilling the Sanctum loop.',
    ],
  },
  {
    key: 'foolish-mathematician',
    title: 'Foolish Burial into Mathematician',
    keyCardNames: ['Foolish Burial', 'Mathematician'],
    steps: [
      'Activate Foolish Burial, sending Mathematician from your Deck to the GY.',
      "Mathematician's effect triggers on being sent to the GY: add 1 Normal Spell Card from your Deck to your hand (take 1000 damage).",
    ],
  },
];
