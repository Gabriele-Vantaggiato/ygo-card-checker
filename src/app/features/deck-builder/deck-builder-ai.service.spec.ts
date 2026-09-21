import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { GeminiCoachService } from '../../services/gemini-coach.service';
import { DeckBuilderAiService, parseAndValidateSuggestions } from './deck-builder-ai.service';
import { GateCardFacts } from './deck-builder-gate.util';
import { signal } from '@angular/core';
import { CardDecisionService } from '../../services/decision/card-decision.service';

const candidates: GateCardFacts[] = [
  { id: 1, name: 'Galaxy Knight', archetype: 'Galaxy-Eyes', setcodes: [], type: 'Effect Monster', isExtraDeck: false, banTcg: null },
  { id: 2, name: 'Galaxy Wizard', archetype: 'Galaxy-Eyes', setcodes: [], type: 'Effect Monster', isExtraDeck: false, banTcg: null },
];

describe('parseAndValidateSuggestions', () => {
  it('keeps only ids present in the gated candidate pool, in the returned order', () => {
    const raw = JSON.stringify([
      { id: 2, reason: 'fills the extender slot' },
      { id: 999999, reason: 'a card the model invented outside the pool' },
      { id: 1, reason: 'core piece' },
    ]);
    expect(parseAndValidateSuggestions(raw, candidates)).toEqual([
      { cardId: 2, reason: 'fills the extender slot' },
      { cardId: 1, reason: 'core piece' },
    ]);
  });

  it('tolerates the model wrapping the JSON array in markdown fences or extra prose', () => {
    const raw = 'Here you go:\n```json\n[{"id": 1, "reason": "ok"}]\n```\nHope that helps!';
    expect(parseAndValidateSuggestions(raw, candidates)).toEqual([{ cardId: 1, reason: 'ok' }]);
  });

  it('returns an empty array for unparsable or non-array responses instead of throwing', () => {
    expect(parseAndValidateSuggestions('not json at all', candidates)).toEqual([]);
    expect(parseAndValidateSuggestions('{"id": 1}', candidates)).toEqual([]);
    expect(parseAndValidateSuggestions('', candidates)).toEqual([]);
  });

  it('drops entries with a non-string reason instead of failing the whole batch', () => {
    const raw = JSON.stringify([{ id: 1, reason: 12345 }, { id: 2, reason: 'valid' }]);
    expect(parseAndValidateSuggestions(raw, candidates)).toEqual([{ cardId: 2, reason: 'valid' }]);
  });
});

describe('DeckBuilderAiService', () => {
  it('uses the local model for the admissible pool and never calls Gemini on local fallback', () => {
    const gemini = jasmine.createSpyObj<GeminiCoachService>('GeminiCoachService', ['ask$']);
    const rank = jasmine.createSpy('rank$').and.returnValue(of([{ cardId: 2, score: 0.8 }]));
    TestBed.configureTestingModule({ providers: [
      { provide: GeminiCoachService, useValue: gemini },
      { provide: CardDecisionService, useValue: {
        preferences: signal({ enabled: true, prompt: 'Find an extender' }), rank$: rank,
      } },
    ] });
    const service = TestBed.inject(DeckBuilderAiService);
    service.rank$(candidates, 'deck summary', 'en').subscribe(result => {
      expect(result.map(c => c.cardId)).toEqual([2]);
    });
    expect(rank.calls.mostRecent().args[0]).toBe('Find an extender');
    expect(rank.calls.mostRecent().args[1].map((c: { cardId: number }) => c.cardId)).toEqual([1, 2]);
    rank.and.returnValue(of([]));
    service.rank$(candidates, 'deck summary', 'en').subscribe(result => expect(result).toEqual([]));
    expect(gemini.ask$).not.toHaveBeenCalled();
  });
  it('returns an empty list without calling Gemini when there are no candidates', (done) => {
    const gemini = jasmine.createSpyObj<GeminiCoachService>('GeminiCoachService', ['ask$']);
    TestBed.configureTestingModule({ providers: [{ provide: GeminiCoachService, useValue: gemini }] });
    const service = TestBed.inject(DeckBuilderAiService);

    service.rank$([], 'deck summary', 'en').subscribe((result) => {
      expect(result).toEqual([]);
      expect(gemini.ask$).not.toHaveBeenCalled();
      done();
    });
  });

  it('falls back to an empty list (never throws) when Gemini errors', (done) => {
    const gemini = jasmine.createSpyObj<GeminiCoachService>('GeminiCoachService', ['ask$']);
    gemini.ask$.and.returnValue(throwError(() => new Error('replay.gemini.error.quota')));
    TestBed.configureTestingModule({ providers: [{ provide: GeminiCoachService, useValue: gemini }] });
    const service = TestBed.inject(DeckBuilderAiService);

    service.rank$(candidates, 'deck summary', 'en').subscribe((result) => {
      expect(result).toEqual([]);
      done();
    });
  });

  it('validates the response against the exact candidate pool passed in', (done) => {
    const gemini = jasmine.createSpyObj<GeminiCoachService>('GeminiCoachService', ['ask$']);
    gemini.ask$.and.returnValue(of(JSON.stringify([{ id: 1, reason: 'core piece' }])));
    TestBed.configureTestingModule({ providers: [{ provide: GeminiCoachService, useValue: gemini }] });
    const service = TestBed.inject(DeckBuilderAiService);

    service.rank$(candidates, 'deck summary', 'en').subscribe((result) => {
      expect(result).toEqual([{ cardId: 1, reason: 'core piece' }]);
      done();
    });
  });
});
