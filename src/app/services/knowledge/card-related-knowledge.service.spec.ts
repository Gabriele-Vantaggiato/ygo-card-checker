import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { CardRelatedKnowledgeService } from './card-related-knowledge.service';
import { CardKnowledgeIndexService } from '../card-knowledge-index.service';
import { CardLegalityFacade } from '../card-legality.facade';
import { I18nService } from '../i18n.service';
import { DeckStrategyStore } from '../../features/decklist/stores/deck-strategy.store';
import { SynergyRetrievalService } from '../synergy-retrieval.service';
import { CardDecisionService } from '../decision/card-decision.service';
import { DecisionScore } from '../decision/card-decision.model';
import { buildCompletionProfile } from '../../utils/completion-prompt.utils';
import { CardKnowledgeEntry, CardKnowledgeRelated, CardRelatedResult } from '../../models/card-knowledge.model';
import { YgoFormat } from '../../models/ygo-format.model';
import { YgoCard } from '../../models/ygo-card.model';

describe('Related Cards local decision integration', () => {
  it('shows the baseline immediately, filters forbidden cards before inference and cancels obsolete rankings', () => {
    const prefs = new BehaviorSubject({ enabled: true, prompt: 'draw cards' });
    const first = new Subject<DecisionScore[]>();
    const second = new Subject<DecisionScore[]>();
    const rank = jasmine.createSpy('rank$').and.returnValues(first, second);
    const entry: CardKnowledgeEntry = { tags: ['draw'], series: [], mentions: [], effects: [], related: [] };
    const related: CardKnowledgeRelated[] = [1, 2, 3].map(id => ({
      id, name: `Candidate ${id}`, relation: 'engine', score: 4 - id,
      archetype: null, tcgDate: null, banTcg: null, imageSmall: '',
    }));
    TestBed.configureTestingModule({ providers: [
      { provide: CardKnowledgeIndexService, useValue: {
        related$: of({ entries: { '9': entry, '1': entry, '2': entry, '3': entry } }),
        formatLegality$: of({ formats: ['tcg'], playable: { '1': ['tcg'], '2': ['tcg'] }, maxCopies: { '2': { tcg: 1 } } }),
      } },
      { provide: CardLegalityFacade, useValue: {} },
      { provide: I18nService, useValue: { t: (key: string) => key } },
      { provide: DeckStrategyStore, useValue: { ragResult$: of({ profile: buildCompletionProfile('combo', '') }) } },
      { provide: SynergyRetrievalService, useValue: { retrieve$: () => of(related) } },
      { provide: CardDecisionService, useValue: { preferences$: prefs, preferences: () => prefs.value, rank$: rank } },
    ] });
    const card: YgoCard = { id: 9, name: 'Source', type: 'Effect Monster', desc: 'Draw cards.', card_images: [] };
    const format: YgoFormat = { id: 'tcg', name: { it: 'TCG', en: 'TCG' }, description: { it: '', en: '' },
      banlistId: null, banlistEffectiveDate: null, cardPoolEndDate: null, cardPoolStartDate: '', banlistSource: 'ban_tcg' };
    const results: CardRelatedResult[] = [];
    const sub = TestBed.inject(CardRelatedKnowledgeService).findRelated$(card, format).subscribe(r => results.push(r));
    expect(results[0].suggestions.map(c => c.cardId)).toEqual([1, 2]);
    expect(rank.calls.first().args[1].map((c: { cardId: number }) => c.cardId)).toEqual([1, 2]);
    prefs.next({ enabled: true, prompt: 'remove cards' });
    const before = results.length;
    first.next([{ cardId: 1, score: 1 }]);
    expect(results.length).toBe(before);
    second.next([{ cardId: 2, score: 1 }, { cardId: 1, score: 0.5 }]);
    const last = results[results.length - 1];
    expect(last.suggestions.map(c => c.cardId)).toEqual([2, 1]);
    expect(last.groups[0].suggestions.map(c => c.cardId)).toEqual([2, 1]);
    expect(last.suggestions[0].maxCopies).toBe(1);
    sub.unsubscribe();
  });
});
