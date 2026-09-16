import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError, timer } from 'rxjs';
import { catchError, map, mergeMap, timeout } from 'rxjs/operators';
import { ReplayCoachBrief } from '../models/replay-restriction.model';
import {
  clearStoredGeminiSecret,
  decryptApiKey,
  encryptApiKey,
  hasStoredGeminiSecret,
  readStoredGeminiSecret,
  writeStoredGeminiSecret,
} from '../features/replay/utils/gemini-secret.utils';

const MODEL_STORAGE = 'ygo-gemini-model';
const TIMEOUT_MS = 90_000;
const HIGH_DEMAND_RETRIES = 2;
const HIGH_DEMAND_DELAY_MS = 2500;

/**
 * Official curl shape (Google AI Studio):
 * POST …/v1beta/models/gemini-flash-latest:generateContent
 * Header: X-goog-api-key
 *
 * Browser cannot call Google directly (CORS) → local proxy on :8787
 * (started by `npm start` via tools/start-dev.mjs).
 */
const GEMINI_BASE =
  (typeof localStorage !== 'undefined' && localStorage.getItem('ygo-gemini-base')?.trim()) ||
  'http://127.0.0.1:8787';

/**
 * Current Gemini Developer API Flash IDs, newest stable first (verified live
 * against https://ai.google.dev/gemini-api/docs/models on 2026-09-16).
 * 2.0 Flash family is shut down — Google returns "no longer available".
 * gemini-3-flash-preview is experimental (tighter rate limits) so it sits
 * last, after every GA model.
 */
export const GEMINI_MODEL_OPTIONS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
] as const;

const DEFAULT_MODEL = GEMINI_MODEL_OPTIONS[0];

const DEPRECATED_STORED_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-flash-latest', // often aliases to retired 2.0
]);

/** Errors where trying the next model can help. */
const FALLTHROUGH_ERRORS = new Set([
  'replay.gemini.error.model',
  'replay.gemini.error.highDemand',
  'replay.gemini.error.quota',
]);

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string; status?: string; code?: number };
}

@Injectable({ providedIn: 'root' })
export class GeminiCoachService {
  private readonly http = inject(HttpClient);

  private sessionKey: string | null = null;

  readonly unlocked = signal(false);
  readonly hasStoredKey = signal(hasStoredGeminiSecret());
  readonly selectedModel = signal(readStoredModel());
  readonly lastUsedModel = signal<string | null>(null);
  /** Last upstream error message (safe to show; never includes the API key). */
  readonly lastErrorDetail = signal<string | null>(null);
  /** Models attempted in the last coach$ call (for clearer errors). */
  readonly lastAttemptedModels = signal<string[]>([]);

  readonly modelOptions = GEMINI_MODEL_OPTIONS;

  get model(): string {
    return this.selectedModel();
  }

  setModel(model: string): void {
    const next = model.trim() || DEFAULT_MODEL;
    this.selectedModel.set(next);
    try {
      localStorage.setItem(MODEL_STORAGE, next);
    } catch {
      /* ignore */
    }
  }

  isUnlocked(): boolean {
    return !!this.sessionKey;
  }

  async saveEncryptedKey(apiKey: string, passphrase: string): Promise<void> {
    const trimmed = apiKey.trim();
    if (!trimmed || passphrase.length < 4) {
      throw new Error('replay.gemini.error.weakPassphrase');
    }
    if (!looksLikeGeminiApiKey(trimmed)) {
      throw new Error('replay.gemini.error.badKeyFormat');
    }
    const blob = await encryptApiKey(trimmed, passphrase);
    writeStoredGeminiSecret(blob);
    this.sessionKey = trimmed;
    this.unlocked.set(true);
    this.hasStoredKey.set(true);
  }

  async unlock(passphrase: string): Promise<void> {
    const blob = readStoredGeminiSecret();
    if (!blob) throw new Error('replay.gemini.error.noStoredKey');
    try {
      this.sessionKey = await decryptApiKey(blob, passphrase);
      this.unlocked.set(true);
    } catch {
      this.sessionKey = null;
      this.unlocked.set(false);
      throw new Error('replay.gemini.error.badPassphrase');
    }
  }

  lockSession(): void {
    this.sessionKey = null;
    this.unlocked.set(false);
  }

  clearStored(): void {
    clearStoredGeminiSecret();
    this.sessionKey = null;
    this.unlocked.set(false);
    this.hasStoredKey.set(false);
  }

  coach$(brief: ReplayCoachBrief, lang: 'it' | 'en'): Observable<string> {
    if (!this.sessionKey) {
      return of('');
    }
    // Match official curl: single user text part (system rules prepended).
    const prompt = `${buildSystemPrompt(lang)}\n\n---\nBRIEF JSON:\n${JSON.stringify(brief, null, 2)}`;
    return this.askGemini$(prompt);
  }

  /**
   * Asks Gemini for a deck as plain text lines (`<qty> <name>` under `#main`/`#extra`/`#side`) —
   * the exact grammar `parseDeckText` already accepts, so the result goes through the same
   * name-resolution/legality pipeline as a manual text import. Gemini never touches the app's
   * card catalog directly; any invented card name simply comes back unresolved at import time.
   * Also asks for its reasoning (strategy, why these cards) as a separate section, so the model
   * explains itself and the user has something concrete to push back on when refining.
   */
  generateDeck$(prompt: string, lang: 'it' | 'en', currentDeckText?: string): Observable<GeneratedDeck> {
    if (!this.sessionKey) {
      return of({ reasoning: '', deckText: '' });
    }
    const full = buildDeckGenPrompt(prompt, lang, currentDeckText);
    return this.askGemini$(full).pipe(map(parseDeckGenResponse));
  }

  private askGemini$(prompt: string): Observable<string> {
    if (!this.sessionKey) {
      return of('');
    }
    this.lastUsedModel.set(null);
    this.lastErrorDetail.set(null);
    this.lastAttemptedModels.set([]);

    const key = this.sessionKey;
    const body = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    };
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-goog-api-key': key,
    });

    const preferred = this.selectedModel();
    // Prefer lighter models first when falling through (skip overloaded 2.0 when possible).
    const rest = GEMINI_MODEL_OPTIONS.filter((m) => m !== preferred);
    const chain = [preferred, ...rest];
    return this.tryModels$(chain, body, headers);
  }

  private tryModels$(models: string[], body: object, headers: HttpHeaders): Observable<string> {
    if (models.length === 0) {
      return throwError(() => new Error('replay.gemini.error.exhausted'));
    }
    const [current, ...rest] = models;
    this.lastAttemptedModels.update((prev) => [...prev, current]);
    return this.callModelWithRetries$(current, body, headers, HIGH_DEMAND_RETRIES).pipe(
      catchError((err: unknown) => {
        const mapped =
          err instanceof Error && err.message.startsWith('replay.')
            ? err.message
            : mapHttpError(err);
        if (FALLTHROUGH_ERRORS.has(mapped) && rest.length > 0) {
          return this.tryModels$(rest, body, headers);
        }
        const attempted = this.lastAttemptedModels().join(' → ');
        const detail = this.lastErrorDetail();
        if (attempted) {
          this.lastErrorDetail.set(
            detail
              ? `Tried: ${attempted}. Last: ${detail}`
              : `Tried: ${attempted}`,
          );
        }
        return throwError(() => new Error(mapped));
      }),
    );
  }

  private callModelWithRetries$(
    model: string,
    body: object,
    headers: HttpHeaders,
    retriesLeft: number,
  ): Observable<string> {
    const url = `${GEMINI_BASE}/v1beta/models/${model}:generateContent`;

    return this.http.post<GeminiGenerateResponse>(url, body, { headers }).pipe(
      timeout(TIMEOUT_MS),
      map((res) => {
        if (res.error?.message) {
          this.lastErrorDetail.set(res.error.message);
          throw new Error(mapGeminiApiMessage(res.error.message, res.error.code));
        }
        const text =
          res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
        if (!text.trim()) throw new Error('replay.gemini.error.empty');
        this.lastUsedModel.set(model);
        if (model !== this.selectedModel()) {
          this.setModel(model);
        }
        return text.trim();
      }),
      catchError((err: unknown) => {
        const detail = extractErrorDetail(err);
        if (detail) this.lastErrorDetail.set(detail);
        const mapped = mapHttpError(err);

        if (mapped === 'replay.gemini.error.highDemand' && retriesLeft > 0) {
          return timer(HIGH_DEMAND_DELAY_MS).pipe(
            mergeMap(() => this.callModelWithRetries$(model, body, headers, retriesLeft - 1)),
          );
        }

        if (mapped === 'replay.gemini.error.cors' || mapped === 'replay.gemini.error.proxyDown') {
          return throwError(() => new Error(mapped));
        }

        return throwError(() => new Error(mapped));
      }),
    );
  }
}

function readStoredModel(): string {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE)?.trim();
    if (!stored || DEPRECATED_STORED_MODELS.has(stored)) {
      localStorage.setItem(MODEL_STORAGE, DEFAULT_MODEL);
      return DEFAULT_MODEL;
    }
    if ((GEMINI_MODEL_OPTIONS as readonly string[]).includes(stored)) {
      return stored;
    }
    localStorage.setItem(MODEL_STORAGE, DEFAULT_MODEL);
    return DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

function buildSystemPrompt(lang: 'it' | 'en'): string {
  if (lang === 'it') {
    return [
      'Sei un coach Yu-Gi-Oh che spiega la partita principale e i trend delle partite recenti fornite.',
      'Spiega solo findings e confronti forniti: non inventare missplay o linee ottimali. Una deviazione non prova un errore.',
      'Se non ci sono errori dimostrati, dillo; non riempire le sezioni con errori inventati. Riporta i campioni dei trend.',
      'Obiettivo: far capire come migliorare QUELLA partita, non scrivere un saggio di regole.',
      'Rispetta sempre legalLocks e engineFlagsExplained del brief: non inventare mosse illegali.',
      'Se Duality (o lock simili) bloccano Special Summon, non biasimare trigger SS illegali.',
      '',
      'FORMATO OBBLIGATORIO (italiano, markdown leggero):',
      '## Verdetto',
      '1-2 frasi: chi ha vinto e perché la partita si è decisa così.',
      '## Cosa hai fatto bene',
      'Max 2 bullet concreti legati a turni/carte di QUESTA partita.',
      '## Dove potevi giocare meglio',
      'Solo i punti supportati dal brief (anche zero). Per ognuno usa:',
      '- **Momento (turno X):** …',
      '- **Hai fatto:** …',
      '- **Era meglio:** …',
      '- **Perché:** … (impatto sul board/LP/risorse, in linguaggio semplice)',
      '## La lezione n.1 di questa partita',
      'Una sola priorità pratica da ricordare la prossima volta.',
      '',
      'DIVIETI: niente elenchi di regole astratte; niente “Chain Link 2” senza traduzione semplice;',
      'niente consigli Extra Deck generici non legati a un turno reale; niente ripetere il timeline intero;',
      'max ~350 parole; tono diretto e comprensibile.',
    ].join('\n');
  }
  return [
    'You explain the primary duel and supplied recent-game trends clearly.',
    'Explain only supplied findings and comparisons; never invent mistakes or optimal lines. A deviation is not a proven error.',
    'If no errors are established, say so instead of filling sections with invented errors. Report trend sample sizes.',
    'Goal: how to play THIS game better — not a rules essay.',
    'Always respect legalLocks and engineFlagsExplained; never invent illegal plays.',
    'If Duality (or similar) locked Special Summons, do not blame illegal SS triggers.',
    '',
    'REQUIRED FORMAT (markdown-lite):',
    '## Verdict',
    '1-2 sentences: who won and why the game turned.',
    '## What you did well',
    'Max 2 concrete bullets tied to turns/cards in THIS duel.',
    '## Where you could play better',
    'Only points supported by the brief (possibly zero). For each use:',
    '- **Moment (turn X):** …',
    '- **You did:** …',
    '- **Better line:** …',
    '- **Why:** … (board/LP/resources impact, plain language)',
    '## Lesson #1 from this game',
    'One practical takeaway for next time.',
    '',
    'FORBIDDEN: abstract rules dumps; unexplained jargon; generic Extra Deck theory not tied to a real turn;',
    'do not paste the whole timeline; max ~350 words; direct and understandable.',
  ].join('\n');
}

const REASONING_MARKER = '===REASONING===';
const DECKLIST_MARKER = '===DECKLIST===';

export interface GeneratedDeck {
  /** Free-text explanation of the strategy/choices, shown to the user, never parsed as cards. */
  reasoning: string;
  /** Plain-text `#main`/`#extra`/`#side` list, fed straight into parseDeckText. */
  deckText: string;
}

/** Splits a generateDeck$ response on the two literal markers; degrades gracefully if Gemini
 *  drops them (whole reply treated as the list, empty reasoning) rather than losing the deck. */
export function parseDeckGenResponse(raw: string): GeneratedDeck {
  const deckIdx = raw.indexOf(DECKLIST_MARKER);
  if (deckIdx < 0) {
    return { reasoning: '', deckText: raw.trim() };
  }
  const reasonIdx = raw.indexOf(REASONING_MARKER);
  const reasoning = reasonIdx >= 0 ? raw.slice(reasonIdx + REASONING_MARKER.length, deckIdx).trim() : '';
  const deckText = raw.slice(deckIdx + DECKLIST_MARKER.length).trim();
  return { reasoning, deckText };
}

function buildDeckGenPrompt(prompt: string, lang: 'it' | 'en', currentDeckText?: string): string {
  const rules =
    lang === 'it'
      ? [
          'Sei un generatore di decklist Yu-Gi-Oh! TCG.',
          `Rispondi in ESATTAMENTE due parti, in questo ordine, con questi marcatori letterali su una riga da soli (mai tradotti): "${REASONING_MARKER}" e "${DECKLIST_MARKER}".`,
          `Sotto ${REASONING_MARKER}: 2-5 frasi in italiano. Spiega la strategia, perché hai scelto gli starter/extender chiave, eventuali compromessi. Questo testo non deve contenere righe "<numero> <nome>".`,
          `Sotto ${DECKLIST_MARKER}: SOLO la lista, una carta per riga: "<quantità> <Nome Ufficiale Inglese>".`,
          'Usa sezioni "#main", "#extra", "#side" nella lista (in questo ordine; ometti una sezione se vuota).',
          'Usa SEMPRE il nome ufficiale inglese esatto della carta (come stampato in TCG/OCG), mai nomi tradotti o inventati.',
          'Rispetta i limiti di copie (max 3, salvo Semi-Limited/Limited/Forbidden se noti) e le dimensioni standard di un mazzo TCG (Main 40–60, Extra 0–15, Side 0–15).',
          'Se non sei sicuro che una carta esista con quel nome esatto, NON includerla: meglio un mazzo più corto ma corretto che carte inventate.',
          'Nessun markdown, nessun testo fuori dalle due sezioni marcate.',
        ]
      : [
          'You are a Yu-Gi-Oh! TCG decklist generator.',
          `Reply in EXACTLY two parts, in this order, with these literal markers alone on their own line (never translated): "${REASONING_MARKER}" and "${DECKLIST_MARKER}".`,
          `Under ${REASONING_MARKER}: 2-5 sentences in English. Explain the strategy, why you picked the key starters/extenders, any tradeoffs. This text must not contain "<number> <name>" lines.`,
          `Under ${DECKLIST_MARKER}: ONLY the list, one card per line: "<quantity> <Official English Name>".`,
          'Use "#main", "#extra", "#side" section markers in the list (in this order; omit a section entirely if empty).',
          'ALWAYS use the exact official English card name (as printed in TCG/OCG), never translated or invented names.',
          'Respect copy limits (max 3, unless a card is known Semi-Limited/Limited/Forbidden) and standard TCG deck sizes (Main 40–60, Extra 0–15, Side 0–15).',
          "If you are not certain a card exists under that exact name, do NOT include it: a shorter correct deck beats invented cards.",
          'No markdown, no text outside the two marked sections.',
        ];
  const context = currentDeckText?.trim()
    ? lang === 'it'
      ? `\n\n---\nMAZZO ATTUALE (parti da qui, applica la richiesta come modifica):\n${currentDeckText.trim()}`
      : `\n\n---\nCURRENT DECK (start from this, apply the request as a change):\n${currentDeckText.trim()}`
    : '';
  const label = lang === 'it' ? 'RICHIESTA' : 'REQUEST';
  return `${rules.join('\n')}${context}\n\n---\n${label}:\n${prompt.trim()}`;
}

export function looksLikeGeminiApiKey(key: string): boolean {
  const k = key.trim();
  if (k.startsWith('AIza') && k.length >= 30) return true;
  if (k.length >= 32 && /^[A-Za-z0-9._-]+$/.test(k)) return true;
  return false;
}

function extractErrorDetail(err: unknown): string | null {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return `Proxy unreachable at ${GEMINI_BASE}. Run npm start (starts gemini-dev-proxy on :8787).`;
    }
    const apiMsg =
      typeof err.error === 'object' && err.error && 'error' in err.error
        ? String((err.error as { error?: { message?: string } }).error?.message ?? '')
        : typeof err.error === 'string'
          ? err.error
          : '';
    if (apiMsg) return apiMsg.slice(0, 300);
    return `HTTP ${err.status}`;
  }
  if (err instanceof Error && !err.message.startsWith('replay.')) {
    return err.message.slice(0, 300);
  }
  return null;
}

function mapGeminiApiMessage(message: string, code?: number): string {
  const m = message.toLowerCase();
  if (code === 400 || m.includes('api key not valid') || m.includes('invalid api key')) {
    return 'replay.gemini.error.invalidKey';
  }
  if (
    m.includes('no longer available') ||
    m.includes('update your code') ||
    m.includes('we recommend you to use')
  ) {
    return 'replay.gemini.error.model';
  }
  if (
    m.includes('high demand') ||
    m.includes('spikes in demand') ||
    m.includes('try again later') ||
    m.includes('unavailable') ||
    m.includes('overloaded') ||
    code === 503
  ) {
    return 'replay.gemini.error.highDemand';
  }
  if (
    code === 429 ||
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('resource_exhausted')
  ) {
    return 'replay.gemini.error.quota';
  }
  if (
    code === 404 ||
    (m.includes('model') &&
      (m.includes('not found') || m.includes('not supported') || m.includes('is not found')))
  ) {
    return 'replay.gemini.error.model';
  }
  return 'replay.gemini.error.request';
}

function mapHttpError(err: unknown): string {
  if (err instanceof Error && err.message.startsWith('replay.')) {
    return err.message;
  }
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'replay.gemini.error.proxyDown';
    }
    const apiMsg =
      typeof err.error === 'object' && err.error && 'error' in err.error
        ? String((err.error as { error?: { message?: string; code?: number } }).error?.message ?? '')
        : '';
    const apiCode =
      typeof err.error === 'object' && err.error && 'error' in err.error
        ? (err.error as { error?: { code?: number } }).error?.code
        : err.status;
    if (apiMsg) return mapGeminiApiMessage(apiMsg, apiCode ?? err.status);
    if (err.status === 400 || err.status === 401 || err.status === 403) {
      return 'replay.gemini.error.invalidKey';
    }
    if (err.status === 404) return 'replay.gemini.error.model';
    if (err.status === 429) return 'replay.gemini.error.quota';
    if (err.status === 503) return 'replay.gemini.error.highDemand';
  }
  return 'replay.gemini.error.request';
}
