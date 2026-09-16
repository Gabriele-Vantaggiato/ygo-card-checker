import {
  ParsedReplay,
  ReplayDeckPair,
  ReplayDeckSection,
  ReplayEvent,
} from '../../../models/replay.model';

type MsgLike = {
  constructor: { name: string };
  playerType?: number;
  player?: number;
  type?: number;
  controller?: number;
  code?: number;
  count?: number;
  value?: number;
  phase?: number;
  cards?: number[];
  startLp0?: number;
  duelRule?: number;
};

type YrpDeckLike = {
  main?: number[] | null;
  extra?: number[] | null;
  side?: number[] | null;
};

type YrpLike = {
  hostName?: string;
  clientName?: string;
  startLp?: number;
  hostDeck?: YrpDeckLike | null;
  clientDeck?: YrpDeckLike | null;
};

type Yrp3dLike = {
  name0: string;
  name1: string;
  masterRule: number;
  messages: MsgLike[];
  extractYrp: () => YrpLike | null | undefined;
};

function section(deck?: YrpDeckLike | null): ReplayDeckSection {
  return {
    main: [...(deck?.main ?? [])],
    extra: [...(deck?.extra ?? [])],
    side: [...(deck?.side ?? [])],
  };
}

const normalizeName = (name: string | undefined): string => (name ?? '').trim().toLowerCase();

/**
 * hostDeck/clientDeck track the network connection role, not the seat (playerType).
 * A host can play from seat 1 (e.g. letting the opponent go first), which decouples
 * "host" from "player 0" — so the seat-number heuristic alone silently attaches the
 * wrong deck as `focus`, and no real decklist will ever match it. Names are recorded
 * independently for both (hostName/clientName vs name0/name1), so prefer matching on
 * name when it's unambiguous and only fall back to the seat heuristic otherwise.
 */
function resolveDecks(
  yrp: YrpLike | null | undefined,
  focusController: number,
  focusName: string,
  opponentName: string,
): ReplayDeckPair | null {
  if (!yrp?.hostDeck && !yrp?.clientDeck) return null;
  const host = section(yrp.hostDeck);
  const client = section(yrp.clientDeck);
  const focus = normalizeName(focusName);
  const opponent = normalizeName(opponentName);
  const hostName = normalizeName(yrp.hostName);
  const clientName = normalizeName(yrp.clientName);
  if (hostName && hostName !== clientName) {
    if (hostName === focus) return { focus: host, opponent: client };
    if (hostName === opponent) return { focus: client, opponent: host };
  }
  if (clientName && clientName !== hostName) {
    if (clientName === focus) return { focus: client, opponent: host };
    if (clientName === opponent) return { focus: host, opponent: client };
  }
  if (focusController === 0) {
    return { focus: host, opponent: client };
  }
  return { focus: client, opponent: host };
}

function emptyStats() {
  return { summons: 0, spSummons: 0, chains: 0, attacks: 0, missedEffects: 0, damageTaken: 0, damageDealt: 0 };
}

/**
 * Normalize a parsed YGOProYrp3d object into our app DuelLog shape.
 * Uses constructor names + fields so we stay loosely coupled to ygopro-msg-encode.
 */
export function normalizeYrp3d(
  yrp3d: Yrp3dLike,
  meta: { fileName: string; sha256: string; byteLength: number },
): ParsedReplay {
  const start = yrp3d.messages.find((m) => m.constructor.name === 'YGOProMsgStart');
  const focusController = typeof start?.playerType === 'number' ? start.playerType & 0x0f : 0;
  const focusName = (yrp3d.name0 || 'Player').trim() || 'Player';
  const opponentName = (yrp3d.name1 || 'Opponent').trim() || 'Opponent';

  const yrp = yrp3d.extractYrp?.() ?? null;
  const decks = resolveDecks(yrp, focusController, focusName, opponentName);

  const events: ReplayEvent[] = [];
  let turnCount = 0;
  let currentTurn = 0;
  let winnerController: number | null = null;
  let winReason: number | null = null;
  const interacted = new Set<number>();

  for (const msg of yrp3d.messages) {
    const type = msg.constructor.name;
    switch (type) {
      case 'YGOProMsgNewTurn': {
        currentTurn += 1;
        turnCount = currentTurn;
        events.push({
          kind: 'new_turn',
          controller: msg.player,
          turn: currentTurn,
          rawType: type,
        });
        break;
      }
      case 'YGOProMsgNewPhase':
        events.push({ kind: 'new_phase', phase: msg.phase, turn: currentTurn, rawType: type });
        break;
      case 'YGOProMsgDraw': {
        events.push({
          kind: 'draw',
          cards: msg.cards?.map(code => code > 0 ? code & 0x7fffffff : 0),
          controller: msg.player,
          value: msg.count,
          turn: currentTurn,
          rawType: type,
        });
        if (msg.player === focusController && Array.isArray(msg.cards)) {
          for (const code of msg.cards) {
            if (code > 0) interacted.add(code);
          }
        }
        break;
      }
      case 'YGOProMsgSummoning':
        events.push({
          kind: 'summon',
          controller: msg.controller,
          code: msg.code,
          turn: currentTurn,
          rawType: type,
        });
        if (msg.controller === focusController && msg.code && msg.code > 0) interacted.add(msg.code);
        break;
      case 'YGOProMsgSpSummoning':
        events.push({
          kind: 'sp_summon',
          controller: msg.controller,
          code: msg.code,
          turn: currentTurn,
          rawType: type,
        });
        if (msg.controller === focusController && msg.code && msg.code > 0) interacted.add(msg.code);
        break;
      case 'YGOProMsgSet':
        events.push({
          kind: 'set',
          controller: msg.controller,
          code: msg.code,
          turn: currentTurn,
          rawType: type,
        });
        if (msg.controller === focusController && msg.code && msg.code > 0) interacted.add(msg.code);
        break;
      case 'YGOProMsgChaining':
        events.push({
          kind: 'chain',
          controller: msg.controller,
          code: msg.code,
          turn: currentTurn,
          rawType: type,
        });
        if (msg.controller === focusController && msg.code && msg.code > 0) interacted.add(msg.code);
        break;
      case 'YGOProMsgAttack':
        events.push({ kind: 'attack', turn: currentTurn, rawType: type });
        break;
      case 'YGOProMsgDamage':
        events.push({
          kind: 'damage',
          controller: msg.player,
          value: msg.value,
          turn: currentTurn,
          rawType: type,
        });
        break;
      case 'YGOProMsgRecover':
        events.push({
          kind: 'recover',
          controller: msg.player,
          value: msg.value,
          turn: currentTurn,
          rawType: type,
        });
        break;
      case 'YGOProMsgMissedEffect':
        events.push({
          kind: 'missed_effect',
          controller: msg.controller,
          code: msg.code,
          turn: currentTurn,
          rawType: type,
        });
        break;
      case 'YGOProMsgWin':
        winnerController = typeof msg.player === 'number' ? msg.player : null;
        winReason = typeof msg.type === 'number' ? msg.type : null;
        events.push({
          kind: 'win',
          controller: winnerController ?? undefined,
          value: winReason ?? undefined,
          turn: currentTurn,
          rawType: type,
        });
        break;
      default:
        break;
    }
  }

  const focusWon =
    winnerController === null ? null : winnerController === focusController;

  return {
    fileName: meta.fileName,
    sha256: meta.sha256,
    byteLength: meta.byteLength,
    focusName,
    opponentName,
    focusController,
    masterRule: yrp3d.masterRule,
    startLp: yrp?.startLp ?? start?.startLp0 ?? 8000,
    turnCount,
    winnerController,
    winReason,
    focusWon,
    decks,
    events,
    focusInteractedCodes: [...interacted],
    messageCount: yrp3d.messages.length,
    hasEmbeddedYrp: !!yrp,
  };
}

export function computeReplayStats(replay: ParsedReplay) {
  const stats = emptyStats();
  const focus = replay.focusController;
  for (const e of replay.events) {
    switch (e.kind) {
      case 'summon':
        if (e.controller === focus) stats.summons += 1;
        break;
      case 'sp_summon':
        if (e.controller === focus) stats.spSummons += 1;
        break;
      case 'chain':
        if (e.controller === focus) stats.chains += 1;
        break;
      case 'attack':
        stats.attacks += 1;
        break;
      case 'missed_effect':
        if (e.controller === focus) stats.missedEffects += 1;
        break;
      case 'damage':
        if (e.controller === focus) stats.damageTaken += e.value ?? 0;
        else if (typeof e.controller === 'number') stats.damageDealt += e.value ?? 0;
        break;
      default:
        break;
    }
  }
  return stats;
}
