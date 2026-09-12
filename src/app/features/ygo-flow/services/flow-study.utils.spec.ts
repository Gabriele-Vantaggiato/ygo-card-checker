import { FlowCard } from '../../../models/ygo-flow.model';
import {
  flowRoots,
  flowTemplate,
  nextFlowNodes,
  openingProfile,
  sampleHands,
  seededShuffle,
} from './flow-study.utils';
import { isYgoFlowDocument } from './ygo-flow-io.service';

const cards = Array.from({ length: 40 }, (_, i): FlowCard => ({
  uid: `${i}`,
  passcode: i + 1,
  name: `Card ${i}`,
  type: '',
  desc: '',
  image: '',
  imageSmall: '',
  role: i < 12 ? 'starter' : i < 20 ? 'interaction' : 'untagged',
}));
describe('Flow study calculations', () => {
  it('replays a seed without mutating or losing the original pool', () => {
    const original = cards.map((c) => c.uid);
    const first = seededShuffle(cards, 'match-7');
    expect(first).toEqual(seededShuffle(cards, 'match-7'));
    expect(first).not.toEqual(seededShuffle(cards, 'match-8'));
    expect(first.map((c) => c.uid).sort()).toEqual([...original].sort());
    expect(cards.map((c) => c.uid)).toEqual(original);
  });
  it('matches the exact 12/40 starter probability and its complement', () => {
    const profile = openingProfile(cards, 5)!;
    expect(profile.pAtLeastOneStarter).toBeCloseTo(
      1 - (28 * 27 * 26 * 25 * 24) / (40 * 39 * 38 * 37 * 36),
      12,
    );
    expect(profile.pAtLeastOneStarter + profile.pBrick).toBe(1);
    expect(openingProfile(cards, 6)!.pAtLeastOneStarter).toBeGreaterThan(
      profile.pAtLeastOneStarter,
    );
    expect(openingProfile(cards.slice(0, 4), 5)).toBeNull();
  });
  it('replays no-starter examples exactly and accounts for all sampled hands', () => {
    const result = sampleHands(cards, 6, 'sample');
    expect(result).toEqual(sampleHands([...cards].reverse(), 6, 'sample'));
    expect(result.starters + result.control + result.unclassified).toBe(100);
    for (const example of result.examples) {
      expect(example.hand).toEqual(seededShuffle(cards, example.seed).slice(0, 6));
      expect(example.hand.some((c) => c.role === 'starter')).toBeFalse();
      expect(new Set(example.hand.map((c) => c.uid)).size).toBe(6);
    }
  });
  it('distinguishes all-interaction hands from unclassified hands', () => {
    const interactions = cards.map((c) => ({ ...c, role: 'interaction' as const }));
    expect(sampleHands(interactions, 5, 'control').control).toBe(100);
    expect(sampleHands(interactions, 5, 'control').unclassified).toBe(0);
  });
  it('creates four valid editable branching templates with reachable leaves', () => {
    for (const id of ['opening', 'recovery', 'second', 'grind'] as const) {
      const graph = flowTemplate(id);
      expect(
        isYgoFlowDocument({ version: 2, ydke: '', canvas: graph, roles: {}, savedAt: '' }),
      ).toBeTrue();
      const root = flowRoots(graph)[0];
      const action = nextFlowNodes(graph, root.id)[0].node;
      const condition = nextFlowNodes(graph, action.id)[0].node;
      const outcomes = nextFlowNodes(graph, condition.id);
      expect(outcomes.length).toBe(2);
      expect(outcomes.every((o) => nextFlowNodes(graph, o.node.id).length === 0)).toBeTrue();
      expect(graph.nodes.every((n) => n.cardId === null)).toBeTrue();
    }
  });
});
