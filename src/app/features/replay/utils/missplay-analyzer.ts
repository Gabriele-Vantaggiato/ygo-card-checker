import { MissplayFinding, ParsedReplay } from '../../../models/replay.model';
import { computeReplayStats } from './yrp3d-normalize';

const SHORT_LOSS_TURNS = 2;

function countByCode(codes: number[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const code of codes) {
    if (code <= 0) continue;
    map.set(code, (map.get(code) ?? 0) + 1);
  }
  return map;
}

function uniqueCodes(codes: number[]): number[] {
  return [...new Set(codes.filter((c) => c > 0))];
}

/** Cards in the focus decklist that never appeared in focus interactions this duel. */
export function unusedFocusDeckCodes(replay: ParsedReplay): number[] {
  if (!replay.decks?.focus) return [];
  const deckCodes = uniqueCodes([
    ...replay.decks.focus.main,
    ...replay.decks.focus.extra,
    ...replay.decks.focus.side,
  ]);
  const interacted = new Set(replay.focusInteractedCodes);
  const copies = countByCode([
    ...replay.decks.focus.main,
    ...replay.decks.focus.extra,
    ...replay.decks.focus.side,
  ]);
  // Prefer 1–2 ofs (tech/engine pieces) over full 3-ofs that simply weren't drawn.
  return deckCodes.filter((code) => !interacted.has(code) && (copies.get(code) ?? 0) <= 2);
}

/**
 * Heuristic findings from a structured duel log.
 *
 * Do NOT treat YGOPro `MSG_MISSED_EFFECT` as a missplay: it means “missed timing /
 * effect window closed” in the engine, often because activation was illegal
 * (e.g. Pot of Duality locking Special Summons) — not because the player forgot.
 */
export function analyzeMissplays(replay: ParsedReplay): MissplayFinding[] {
  const findings: MissplayFinding[] = [];
  const stats = computeReplayStats(replay);

  if (replay.focusWon === false && replay.turnCount > 0 && replay.turnCount <= SHORT_LOSS_TURNS) {
    findings.push({
      kind: 'short_loss',
      severity: 'critical',
      titleKey: 'replay.findings.shortLoss.title',
      detailKey: 'replay.findings.shortLoss.detail',
      meta: { turns: replay.turnCount },
    });
  }

  if (
    replay.focusWon === false &&
    replay.turnCount <= 1 &&
    (replay.winReason === 0 || stats.summons + stats.spSummons + stats.chains === 0)
  ) {
    findings.push({
      kind: 'scoop_or_early_end',
      severity: 'warn',
      titleKey: 'replay.findings.earlyEnd.title',
      detailKey: 'replay.findings.earlyEnd.detail',
      meta: { turns: replay.turnCount, reason: replay.winReason ?? -1 },
    });
  }

  if (
    replay.turnCount >= 3 &&
    stats.summons + stats.spSummons === 0 &&
    stats.chains === 0
  ) {
    findings.push({
      kind: 'no_interaction',
      severity: 'critical',
      titleKey: 'replay.findings.noInteraction.title',
      detailKey: 'replay.findings.noInteraction.detail',
      meta: { turns: replay.turnCount },
    });
  }

  return findings;
}

export function analyzeReplay(replay: ParsedReplay) {
  return {
    replay,
    findings: analyzeMissplays(replay),
    stats: computeReplayStats(replay),
  };
}
