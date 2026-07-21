export interface MdproOcrParseResult {
  passcodes: number[];
  candidateName: string | null;
  rawLines: string[];
}

/** Prefer explicit `[99370594]` groups, then bare 7–8 digit tokens. */
const BRACKET_PASSCODE_RE = /\[(\d{7,8})\]/g;
const PASSCODE_RE = /\b(\d{7,8})\b/g;
const BRACKET_META_RE = /^\[[^\]]+\](\s*\[[^\]]+\])*\s*$/;
const NOISE_LINE_RE =
  /^(save image|atk|def|ocg|tcg|g:\d+|test hand|sort|save|\+\d+|-\d+|spell card|trap card|monster card|normal spell|quick-play spell|continuous spell|equip spell|field spell|ritual spell|normal trap|continuous trap|counter trap|carta magia|carta trappola|carta mostro|magia normale|magia rapida|magia continua|magia equipaggiamento|magia terreno|magia rituale|trappola normale|trappola continua|controtrappola)$/i;

/**
 * Parse MDPRO / Master Duel card-detail OCR text.
 * Prefers unique passcodes (esp. `[99370594]`); name is fallback only.
 */
export function parseMdproOcrText(text: string): MdproOcrParseResult {
  const normalized = normalizeOcrDigitNoise(text);
  const rawLines = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const passcodes = extractPasscodes(normalized);
  const candidateName = pickCandidateName(rawLines);
  return { passcodes, candidateName, rawLines };
}

function extractPasscodes(text: string): number[] {
  const passcodes: number[] = [];
  const seen = new Set<number>();

  const push = (raw: string) => {
    const id = Number(raw);
    if (!Number.isFinite(id) || id < 1_000_000) {
      return;
    }
    if (!seen.has(id)) {
      seen.add(id);
      passcodes.push(id);
    }
  };

  BRACKET_PASSCODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACKET_PASSCODE_RE.exec(text)) !== null) {
    push(match[1]);
  }

  // Slash groups: [89631151/89631139]
  for (const group of text.match(/\[([\d/OoIl|]+)\]/g) ?? []) {
    const inner = group.slice(1, -1);
    for (const part of inner.split('/')) {
      const digits = part.replace(/[^\d]/g, '');
      if (digits.length >= 7 && digits.length <= 8) {
        push(digits);
      }
    }
  }

  PASSCODE_RE.lastIndex = 0;
  while ((match = PASSCODE_RE.exec(text)) !== null) {
    push(match[1]);
  }

  return passcodes;
}

/**
 * OCR often confuses O/0 and I/l/1 inside digit-only bracket groups.
 */
function normalizeOcrDigitNoise(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (full, inner: string) => {
    if (!/^[\d/OoIl|SsBbGg\s]+$/.test(inner)) {
      return full;
    }
    const fixed = inner
      .replace(/[Oo]/g, '0')
      .replace(/[Il|]/g, '1')
      .replace(/[Ss]/g, '5')
      .replace(/[Bb]/g, '8')
      .replace(/[Gg]/g, '6');
    return `[${fixed}]`;
  });
}

function pickCandidateName(lines: string[]): string | null {
  for (const line of lines) {
    if (BRACKET_META_RE.test(line)) {
      continue;
    }
    if (NOISE_LINE_RE.test(line)) {
      continue;
    }
    if (/^atk\s*\d+/i.test(line) || /^def\s*\d+/i.test(line)) {
      continue;
    }
    if (/^\d{1,2}$/.test(line)) {
      continue;
    }
    if (/^(normal|quick-?play|continuous|equip|field|ritual)\s+(spell|trap)$/i.test(line)) {
      continue;
    }
    if (/^(magia|trappola)\s+/i.test(line) && line.split(/\s+/).length <= 3) {
      continue;
    }
    if (/^[\d/\s]+$/.test(line)) {
      continue;
    }
    // Strip leading OCR garbage that eats the first letter(s) of the title bar.
    const cleaned = cleanCardName(line);
    if (/[A-Za-zÀ-ÿ]/.test(cleaned) && cleaned.length >= 3) {
      return cleaned;
    }
  }
  return null;
}

export function cleanCardName(name: string): string {
  return name
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable identity key for deduping live OCR lookups — passcode wins over name. */
export function mdproIdentityKey(parsed: MdproOcrParseResult): string {
  if (parsed.passcodes.length > 0) {
    return `id:${parsed.passcodes[0]}`;
  }
  if (parsed.candidateName) {
    return `name:${normalizeCardName(parsed.candidateName)}`;
  }
  return '';
}

export function normalizeCardName(name: string): string {
  return cleanCardName(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** True when OCR still refers to the already-resolved card (skip API). */
export function matchesKnownCard(
  parsed: MdproOcrParseResult,
  cardId: number | null,
  cardName: string | null,
): boolean {
  if (cardId != null && parsed.passcodes.includes(cardId)) {
    return true;
  }
  if (!cardName || !parsed.candidateName) {
    return false;
  }
  const a = normalizeCardName(cardName);
  const b = normalizeCardName(parsed.candidateName);
  if (!a || !b) {
    return false;
  }
  return a === b || a.includes(b) || b.includes(a);
}
