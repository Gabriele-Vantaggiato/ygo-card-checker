import { RestrictionCatalog } from '../../../models/replay-restriction.model';
import { ParsedReplay } from '../../../models/replay.model';
import { buildRestrictionTrace } from './restriction-engine';

function replay(over: Partial<ParsedReplay> = {}): ParsedReplay {
  return {
    fileName: 't.yrp3d',
    sha256: 'x',
    byteLength: 1,
    focusName: 'You',
    opponentName: 'Opp',
    focusController: 1,
    masterRule: 5,
    startLp: 8000,
    turnCount: 4,
    winnerController: 1,
    winReason: 1,
    focusWon: true,
    decks: null,
    events: [
      { kind: 'new_turn', controller: 1, turn: 4, rawType: 'YGOProMsgNewTurn' },
      { kind: 'chain', controller: 1, code: 98645731, turn: 4, rawType: 'YGOProMsgChaining' },
      {
        kind: 'missed_effect',
        controller: 1,
        code: 53678698,
        turn: 4,
        rawType: 'YGOProMsgMissedEffect',
      },
    ],
    focusInteractedCodes: [],
    messageCount: 3,
    hasEmbeddedYrp: false,
    ...over,
  };
}

const catalog: RestrictionCatalog = {
  version: 1,
  coverageNote: 'test',
  kinds: ['cannot_special_summon'],
  cards: {
    '98645731': {
      name: 'Pot of Duality',
      onActivate: [
        {
          kind: 'cannot_special_summon',
          scope: 'controller',
          until: 'end_of_turn',
          note: 'No SS this turn',
        },
      ],
    },
  },
};

describe('buildRestrictionTrace', () => {
  it('explains Mikazuchi missed flag under Duality as not a missplay', () => {
    const trace = buildRestrictionTrace(replay(), catalog, (c) =>
      c === 53678698 ? 'Bujin Mikazuchi' : c === 98645731 ? 'Pot of Duality' : `#${c}`,
    );
    expect(trace.focusLocksSeen.some((l) => l.kind === 'cannot_special_summon')).toBeTrue();
    expect(
      trace.annotations.some(
        (a) => a.kind === 'engine_flag_explained' && a.message.includes('Not a missplay'),
      ),
    ).toBeTrue();
  });
});
