import { ReplayAnalysis } from '../../../models/replay.model';
import { ReplayCoachBrief, RestrictionTrace } from '../../../models/replay-restriction.model';
import {
  buildFocusActionTimeline,
  summarizeLocksForBrief,
} from './restriction-engine';

export function buildReplayCoachBrief(
  analysis: ReplayAnalysis,
  trace: RestrictionTrace,
  resolveName: (code: number) => string,
): ReplayCoachBrief {
  const { replay, stats, findings } = analysis;
  return {
    version: 1,
    fileName: replay.fileName,
    focusName: replay.focusName,
    opponentName: replay.opponentName,
    focusWon: replay.focusWon,
    turnCount: replay.turnCount,
    stats,
    legalLocks: summarizeLocksForBrief(trace),
    timelineNotes: [
      ...trace.timelineNotes,
      '--- focus actions ---',
      ...buildFocusActionTimeline(replay, resolveName),
    ],
    engineFlagsExplained: trace.annotations
      .filter((a) => a.kind === 'engine_flag_explained' || a.kind === 'illegal_under_lock')
      .map((a) => a.message),
    heuristicFindings: findings.map(
      (f) => `${f.kind}${f.code ? `:${resolveName(f.code)}` : ''} (${f.severity})`,
    ),
    instructions: [
      'Write a clear post-game review of THIS duel only.',
      'Focus on decisions that changed the outcome: what was played vs a better alternative.',
      'Use the required section format from the system prompt.',
      'Respect legalLocks strictly; Duality/SS locks are facts, not missplays.',
      'Prefer plain language; if timing matters, explain it in one simple sentence.',
      'Ignore unused main-deck cards unless they clearly affected a real decision this game.',
    ],
  };
}
