import { ParsedReplay } from '../models/replay.model';
export function lineReplay(over: Partial<ParsedReplay> = {}): ParsedReplay {
  return { fileName: 'line.yrp3d', sha256: 'a'.repeat(64), byteLength: 100, focusName: 'You', opponentName: 'Opponent',
    focusController: 0, masterRule: 5, startLp: 8000, turnCount: 3, winnerController: 0, winReason: 0, focusWon: true,
    decks: { focus: { main: [1,2,3,4,5,6], extra: [7], side: [] }, opponent: { main: [], extra: [], side: [] } },
    events: [
      { kind: 'draw', controller: 0, cards: [1,2,3,4,5], value: 5, turn: 0, rawType: 'draw' },
      { kind: 'new_turn', controller: 0, turn: 1, rawType: 'turn' },
      { kind: 'summon', controller: 0, code: 1, turn: 1, rawType: 'summon' },
      { kind: 'chain', controller: 0, code: 1, turn: 1, rawType: 'chain' },
      { kind: 'sp_summon', controller: 0, code: 7, turn: 1, rawType: 'summon' },
      { kind: 'new_turn', controller: 1, turn: 2, rawType: 'turn' },
    ], focusInteractedCodes: [1,7], messageCount: 6, hasEmbeddedYrp: true, ...over };
}
