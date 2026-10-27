import { CARD_LANGUAGES, CardLanguage } from '../models/collection.model';
import { parseSetCode } from './set-code.utils';

export interface AiCardRead {
  name: string | null;
  setCode: string | null;
  language: string | null;
}

/** The language as a valid CardLanguage (case-insensitive), else null. */
export function normalizeLanguage(raw: string | null | undefined): CardLanguage | null {
  const up = (raw ?? '').trim().toUpperCase();
  return (CARD_LANGUAGES as readonly string[]).includes(up) ? (up as CardLanguage) : null;
}

const EMPTY: AiCardRead = { name: null, setCode: null, language: null };
const MAX_NAME = 120;

/** Defensive parse of the model's reply: fenced / prose-wrapped JSON, validated set code. */
export function parseAiCardJson(text: string): AiCardRead {
  const obj = extractObject(text ?? '');
  if (!obj) {
    return { ...EMPTY };
  }
  const rawName = typeof obj['name'] === 'string' ? obj['name'].trim().slice(0, MAX_NAME).trim() : '';
  const rawCode = typeof obj['setCode'] === 'string' ? obj['setCode'] : '';
  const parsed = rawCode ? parseSetCode(rawCode) : null;
  const rawLang = typeof obj['language'] === 'string' ? obj['language'].trim().toUpperCase() : '';
  return {
    name: rawName || null,
    setCode: parsed ? parsed.candidates[0] : null,
    language: /^[A-Z]{2}$/.test(rawLang) ? rawLang : null,
  };
}

function extractObject(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(stripped.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
