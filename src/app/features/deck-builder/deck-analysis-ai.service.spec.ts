import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { GeminiCoachService } from '../../services/gemini-coach.service';
import { DeckAnalysisAiService, parseAndValidateAnalysis } from './deck-analysis-ai.service';
import { GateCardFacts } from './deck-builder-gate.util';

const deckCards = [
  { cardId: 1, name: 'Zombie Master', desc: 'Special Summon a Zombie from your GY' },
  { cardId: 2, name: 'Some Beater', desc: 'A vanilla beater' },
];

const candidatePool: GateCardFacts[] = [
  { id: 3, name: 'Mezuki', archetype: null, setcodes: [], type: 'Effect Monster', isExtraDeck: false, banTcg: null },
  { id: 4, name: 'Unrelated Card', archetype: null, setcodes: [], type: 'Spell Card', isExtraDeck: false, banTcg: null },
];

describe('parseAndValidateAnalysis', () => {
  it('keeps only known category ids, deck-card ids, and pool-admissible suggestion ids', () => {
    const raw = JSON.stringify({
      categories: [
        {
          id: 'gyRecursion',
          cardsInDeck: [1, 999999],
          suggestions: [
            { id: 3, reason: 'revives Zombies too' },
            { id: 55555, reason: 'invented, not in pool' },
          ],
        },
        { id: 'not_a_real_category', cardsInDeck: [], suggestions: [] },
      ],
    });

    const result = parseAndValidateAnalysis(raw, deckCards, candidatePool);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('gyRecursion');
    expect(result[0].cardsInDeck).toEqual([{ cardId: 1, name: 'Zombie Master' }]);
    expect(result[0].suggestions).toEqual([
      { cardId: 3, name: 'Mezuki', imageUrlSmall: jasmine.any(String), reason: 'revives Zombies too' },
    ]);
  });

  it('returns an empty array for unparsable responses instead of throwing', () => {
    expect(parseAndValidateAnalysis('not json', deckCards, candidatePool)).toEqual([]);
    expect(parseAndValidateAnalysis('{}', deckCards, candidatePool)).toEqual([]);
    expect(parseAndValidateAnalysis('{"categories": "nope"}', deckCards, candidatePool)).toEqual([]);
  });
});

describe('DeckAnalysisAiService', () => {
  it('returns [] without calling Gemini when the deck has no cards', (done) => {
    const gemini = jasmine.createSpyObj<GeminiCoachService>('GeminiCoachService', ['ask$']);
    TestBed.configureTestingModule({ providers: [{ provide: GeminiCoachService, useValue: gemini }] });
    const service = TestBed.inject(DeckAnalysisAiService);

    service.analyze$([], candidatePool, 'en').subscribe((result) => {
      expect(result).toEqual([]);
      expect(gemini.ask$).not.toHaveBeenCalled();
      done();
    });
  });

  it('falls back to [] (never throws) when Gemini errors', (done) => {
    const gemini = jasmine.createSpyObj<GeminiCoachService>('GeminiCoachService', ['ask$']);
    gemini.ask$.and.returnValue(throwError(() => new Error('replay.gemini.error.quota')));
    TestBed.configureTestingModule({ providers: [{ provide: GeminiCoachService, useValue: gemini }] });
    const service = TestBed.inject(DeckAnalysisAiService);

    service.analyze$(deckCards, candidatePool, 'en').subscribe((result) => {
      expect(result).toEqual([]);
      done();
    });
  });
});
