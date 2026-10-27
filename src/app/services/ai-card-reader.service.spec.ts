import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AiCardReaderService } from './ai-card-reader.service';
import { GeminiCoachService } from './gemini-coach.service';

describe('AiCardReaderService', () => {
  it('sends an inlineData jpeg + json response config and parses the reply', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const coach = TestBed.inject(GeminiCoachService);
    await coach.saveEncryptedKey('AIza' + 'x'.repeat(35), 'passphrase');
    const http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(AiCardReaderService);

    const pending = service.read('QUJD');
    const req = http.expectOne((r) => r.url.startsWith('/api/gemini/v1beta/models/') && r.url.endsWith(':generateContent'));
    const parts = req.request.body.contents[0].parts;
    expect(parts.some((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType === 'image/jpeg' && p.inlineData.data === 'QUJD')).toBeTrue();
    expect(req.request.body.generationConfig.responseMimeType).toBe('application/json');
    expect(req.request.url).not.toContain('AIza');
    req.flush({ candidates: [{ content: { parts: [{ text: '{"name":"Dark Magician","setCode":"LOB-EN005","language":"EN"}' }] } }] });

    expect(await pending).toEqual({ name: 'Dark Magician', setCode: 'LOB-EN005', language: 'EN' });
    coach.clearStored();
    http.verify();
  });
});
