import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AiProviderPreferencesService } from '../../services/ai-provider-preferences.service';
import { CardDecisionService } from '../../services/decision/card-decision.service';
import { GeminiCoachService } from '../../services/gemini-coach.service';
import { OpenRouterService } from '../../services/openrouter.service';
import { DeckBuilderAiService, buildEffectPrompt } from './deck-builder-ai.service';
import { GateCardFacts } from './deck-builder-gate.util';

const facts = (id: number, name: string, desc?: string): GateCardFacts => ({
  id, name, desc, archetype: null, setcodes: [], type: 'Spell Card', isExtraDeck: false, banTcg: null,
});
const options = [facts(11, 'Mirror A', 'Pay 800 LP: Ritual Summon a monster from your hand.'), facts(12, 'Mirror B', 'Send 1 monster from your GY to the bottom of the Deck; Ritual Summon.')];

describe('buildEffectPrompt', () => {
  it('carries every option with its effect text, the situation and the deck', () => {
    const prompt = buildEffectPrompt(options, '3x Zielgigas, 3x Shadow', 'Pick a Ritual Spell.', 'en');
    expect(prompt).toContain('id 11: Mirror A');
    expect(prompt).toContain('Pay 800 LP');
    expect(prompt).toContain('id 12: Mirror B');
    expect(prompt).toContain('3x Zielgigas');
    expect(prompt).toContain('Pick a Ritual Spell.');
    expect(prompt).toContain('only use the ids listed below');
    expect(prompt).toContain('JSON array');
  });

  it('is written in Italian when asked and still restricts the ids', () => {
    const prompt = buildEffectPrompt(options, 'mazzo', 'contesto', 'it');
    expect(prompt).toContain('SOLO gli id elencati');
    expect(prompt).toContain('SITUAZIONE');
  });

  it('truncates very long effect text and marks missing text', () => {
    const long = facts(13, 'Long', 'x'.repeat(5000));
    const prompt = buildEffectPrompt([long, facts(14, 'Empty')], 'd', 'c', 'en');
    expect(prompt.length).toBeLessThan(2500);
    expect(prompt).toContain('(no effect text)');
  });
});

describe('DeckBuilderAiService.rankWithEffects$', () => {
  const setup = (opts: {
    provider?: 'gemini' | 'openrouter' | 'local';
    localEnabled?: boolean;
    openRouter?: string;
    gemini?: string | Error;
  }) => {
    const gemini = jasmine.createSpyObj<GeminiCoachService>('GeminiCoachService', ['ask$']);
    gemini.ask$.and.returnValue(opts.gemini instanceof Error ? throwError(() => opts.gemini) : of((opts.gemini as string) ?? ''));
    const openRouter = jasmine.createSpyObj<OpenRouterService>('OpenRouterService', ['ask$']);
    openRouter.ask$.and.returnValue(of(opts.openRouter ?? ''));
    const rank = jasmine.createSpy('rank$').and.returnValue(of([{ cardId: 12, score: 0.9 }, { cardId: 11, score: 0.4 }]));
    TestBed.configureTestingModule({
      providers: [
        { provide: GeminiCoachService, useValue: gemini },
        { provide: OpenRouterService, useValue: openRouter },
        { provide: AiProviderPreferencesService, useValue: { preferences: () => ({ provider: opts.provider ?? 'gemini' }) } },
        { provide: CardDecisionService, useValue: { preferences: signal({ enabled: opts.localEnabled ?? false, prompt: '' }), rank$: rank } },
      ],
    });
    return { service: TestBed.inject(DeckBuilderAiService), gemini, openRouter, rank };
  };

  it('answers with nothing and calls nobody when there are no options', async () => {
    const { service, gemini, openRouter } = setup({});
    expect(await firstValueFrom(service.rankWithEffects$([], 'd', 'c', 'en'))).toEqual([]);
    expect(gemini.ask$).not.toHaveBeenCalled();
    expect(openRouter.ask$).not.toHaveBeenCalled();
  });

  it('uses the free model answer and drops ids that are not among the options', async () => {
    const { service, gemini } = setup({ provider: 'openrouter', openRouter: JSON.stringify([{ id: 12, reason: 'no LP cost' }, { id: 999, reason: 'invented' }, { id: 11, reason: 'costs LP' }]) });
    const out = await firstValueFrom(service.rankWithEffects$(options, 'd', 'c', 'en'));
    expect(out).toEqual([{ cardId: 12, reason: 'no LP cost' }, { cardId: 11, reason: 'costs LP' }]);
    expect(gemini.ask$).not.toHaveBeenCalled();
  });

  it('falls back to Gemini when the free model gives nothing usable', async () => {
    const { service, gemini } = setup({ provider: 'gemini', openRouter: 'garbage', gemini: JSON.stringify([{ id: 11, reason: 'fine' }]) });
    const out = await firstValueFrom(service.rankWithEffects$(options, 'd', 'c', 'en'));
    expect(out).toEqual([{ cardId: 11, reason: 'fine' }]);
    expect(gemini.ask$).toHaveBeenCalledTimes(1);
    expect(gemini.ask$.calls.mostRecent().args[0]).toContain('Pay 800 LP');
  });

  it('returns an empty list instead of throwing when every provider fails', async () => {
    const { service } = setup({ provider: 'gemini', openRouter: '', gemini: new Error('boom') });
    expect(await firstValueFrom(service.rankWithEffects$(options, 'd', 'c', 'en'))).toEqual([]);
  });

  it('with the local model sends the effect text to it and never calls a cloud provider', async () => {
    const { service, gemini, openRouter, rank } = setup({ provider: 'local', localEnabled: true });
    const out = await firstValueFrom(service.rankWithEffects$(options, 'deck', 'Pick one', 'it'));
    expect(out.map((o) => o.cardId)).toEqual([12, 11]);
    expect(rank).toHaveBeenCalled();
    expect(rank.calls.mostRecent().args[0]).toContain('Pick one');
    expect(rank.calls.mostRecent().args[1][0].text).toContain('Pay 800 LP');
    expect(gemini.ask$).not.toHaveBeenCalled();
    expect(openRouter.ask$).not.toHaveBeenCalled();
  });
});
