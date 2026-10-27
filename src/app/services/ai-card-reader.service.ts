import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { AiCardRead, parseAiCardJson } from '../utils/ai-card-json.utils';
import { GeminiCoachService } from './gemini-coach.service';

const READ_TIMEOUT_MS = 15_000;

const PROMPT =
  'The image shows a Yu-Gi-Oh! trading card. Read it and reply with STRICT JSON only, no prose: ' +
  '{"name": string|null, "setCode": string|null, "language": "EN"|"IT"|"FR"|"DE"|"ES"|"PT"|"JP"|"KR"|null}. ' +
  '"name" is the card name as printed, "setCode" the set code printed under the artwork on the right (e.g. LOB-EN005). ' +
  'Use null for anything you cannot read with confidence; never guess.';

/** Optional, user-triggered card reading through the user's own Gemini key (via GeminiCoachService). */
@Injectable({ providedIn: 'root' })
export class AiCardReaderService {
  private readonly gemini = inject(GeminiCoachService);

  /** A key is stored (possibly still locked behind its passphrase). */
  hasKey(): boolean {
    return this.gemini.hasStoredKey() || this.gemini.unlocked();
  }

  isUnlocked(): boolean {
    return this.gemini.unlocked();
  }

  /** Throws on transport/key errors; resolves all-null when the reply is unusable. */
  async read(jpegBase64: string): Promise<AiCardRead> {
    const text = await firstValueFrom(
      this.gemini
        .askParts$(
          [{ text: PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } }],
          { responseMimeType: 'application/json' },
        )
        .pipe(timeout(READ_TIMEOUT_MS)),
    );
    return parseAiCardJson(text);
  }
}
