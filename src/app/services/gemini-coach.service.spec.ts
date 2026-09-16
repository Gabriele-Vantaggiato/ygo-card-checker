import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { GEMINI_MODEL_OPTIONS, GeminiCoachService } from './gemini-coach.service';

describe('GeminiCoachService', () => {
  let service: GeminiCoachService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GeminiCoachService);
    httpMock = TestBed.inject(HttpTestingController);
    await service.saveEncryptedKey('AIzaTestKeyForUnitTest0000000000', 'test-pass');
  });

  afterEach(() => httpMock.verify());

  it('returns empty without an unlocked key', async () => {
    service.lockSession();
    expect(await firstValueFrom(service.generateDeck$('zombie deck', 'en'))).toBe('');
    expect(await firstValueFrom(service.coach$({} as never, 'en'))).toBe('');
  });

  it('generateDeck$ sends a text-only prompt and returns the trimmed response', async () => {
    const result$ = service.generateDeck$('zombie GY control', 'en');
    const promise = firstValueFrom(result$);

    const req = httpMock.expectOne(
      (r) => r.url === `http://127.0.0.1:8787/v1beta/models/${service.selectedModel()}:generateContent`,
    );
    expect(req.request.headers.get('X-goog-api-key')).toBe('AIzaTestKeyForUnitTest0000000000');
    expect(req.request.body.contents[0].parts[0].text).toContain('zombie GY control');
    expect(req.request.body.contents[0].parts[0].text).toContain('#main');
    req.flush({ candidates: [{ content: { parts: [{ text: '  #main\n3 Mezuki\n  ' }] } }] });

    expect(await promise).toBe('#main\n3 Mezuki');
  });

  it('falls through to the next model when the preferred one is deprecated', async () => {
    const preferred = service.selectedModel();
    const next = GEMINI_MODEL_OPTIONS.find((m) => m !== preferred)!;
    const result$ = service.generateDeck$('any prompt', 'en');
    const promise = firstValueFrom(result$);

    const first = httpMock.expectOne((r) => r.url.includes(preferred));
    first.flush(
      { error: { message: 'model is not found or your project does not have access', code: 404 } },
      { status: 200, statusText: 'OK' },
    );

    const second = httpMock.expectOne((r) => r.url.includes(next));
    second.flush({ candidates: [{ content: { parts: [{ text: '#main\n1 Foolish Burial' }] } }] });

    expect(await promise).toBe('#main\n1 Foolish Burial');
    expect(service.lastUsedModel()).toBe(next);
  });
});
