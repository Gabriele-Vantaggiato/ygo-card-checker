import { findDuplicateHashes } from './file-hash.utils';
import { analyzeMissplays, analyzeReplay, unusedFocusDeckCodes } from './missplay-analyzer';
import { buildDeckAdvice } from './deck-advice';
import { ParsedReplay } from '../../../models/replay.model';

function baseReplay(over: Partial<ParsedReplay> = {}): ParsedReplay {
  return {
    fileName: 'test.yrp3d',
    sha256: 'aaa',
    byteLength: 100,
    focusName: 'You',
    opponentName: 'Opp',
    focusController: 0,
    masterRule: 5,
    startLp: 8000,
    turnCount: 5,
    winnerController: 1,
    winReason: 1,
    focusWon: false,
    decks: {
      focus: { main: [111, 222, 222], extra: [333], side: [] },
      opponent: { main: [], extra: [], side: [] },
    },
    events: [],
    focusInteractedCodes: [111],
    messageCount: 10,
    hasEmbeddedYrp: true,
    ...over,
  };
}

describe('findDuplicateHashes', () => {
  it('returns duplicate hashes', () => {
    expect(findDuplicateHashes(['a', 'b', 'a'])).toEqual(['a']);
    expect(findDuplicateHashes(['a', 'b', 'c'])).toEqual([]);
  });
});

describe('analyzeMissplays', () => {
  it('does not treat MSG_MISSED_EFFECT as a coaching missplay', () => {
    const findings = analyzeMissplays(
      baseReplay({
        events: [
          { kind: 'missed_effect', controller: 0, code: 53678698, rawType: 'YGOProMsgMissedEffect' },
        ],
      }),
    );
    expect(findings.some((f) => f.kind === 'missed_effect')).toBeFalse();
  });

  it('does not flood single-replay findings with unused deck cards', () => {
    const findings = analyzeMissplays(baseReplay());
    expect(findings.some((f) => f.kind === 'unused_deck_card')).toBeFalse();
    expect(unusedFocusDeckCodes(baseReplay())).toContain(222);
  });

  it('flags short losses', () => {
    const findings = analyzeMissplays(baseReplay({ turnCount: 1, focusWon: false }));
    expect(findings.some((f) => f.kind === 'short_loss')).toBeTrue();
  });
});

describe('buildDeckAdvice', () => {
  it('requires repeated unused hits across multiple replays', () => {
    const a1 = analyzeReplay(baseReplay({ sha256: '1', focusInteractedCodes: [111] }));
    const a2 = analyzeReplay(baseReplay({ sha256: '2', focusInteractedCodes: [111] }));
    const advice = buildDeckAdvice([a1, a2]);
    expect(advice?.items.some((i) => i.code === 222 && i.replayHits === 2)).toBeTrue();
  });
});
