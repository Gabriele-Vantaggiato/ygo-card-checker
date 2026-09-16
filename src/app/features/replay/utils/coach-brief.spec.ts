import { buildReplayCoachBrief } from './coach-brief';
import { analyzeReplay } from './missplay-analyzer';
import { lineReplay } from '../../../testing/replay-line.fixtures';
import { RestrictionTrace } from '../../../models/replay-restriction.model';

describe('multi-replay coach brief', () => {
  it('deduplicates games and supplies deterministic trends and comparisons', () => {
    const trace: RestrictionTrace = {annotations:[],focusLocksSeen:[],timelineNotes:[]};
    const first = analyzeReplay(lineReplay({focusWon:false,turnCount:1}));
    const second = analyzeReplay(lineReplay({sha256:'b'.repeat(64),focusWon:false,turnCount:1}));
    const brief = buildReplayCoachBrief(first,trace,String,[first,second,second]);
    expect(brief.version).toBe(2); expect(brief.recentGames!.length).toBe(2);
    expect(brief.trends!.find(t => t.kind === 'short_loss')!.games).toBe(2);
    expect(brief.instructions.join(' ')).toContain('NOT a proven mistake');
  });
});
