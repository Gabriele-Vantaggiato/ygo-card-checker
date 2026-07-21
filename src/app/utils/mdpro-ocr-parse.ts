export interface MdproOcrParseResult {
  passcodes: number[];
  candidateName: string | null;
  rawLines: string[];
}

const PASSCODE_RE = /\b(\d{7,8})\b/g;
const BRACKET_META_RE = /^\[[^\]]+\](\s*\[[^\]]+\])*\s*$/;
const NOISE_LINE_RE =
  /^(save image|atk|def|ocg|tcg|g:\d+|test hand|sort|save|\+\d+|-\d+|spell card|trap card|monster card|normal spell|quick-play spell|continuous spell|equip spell|field spell|ritual spell|normal trap|continuous trap|counter trap|carta magia|carta trappola|carta mostro|magia normale|magia rapida|magia continua|magia equipaggiamento|magia terreno|magia rituale|trappola normale|trappola continua|controtrappola)$/i;

/**
 * Parse MDPRO / Master Duel card-detail OCR text.
 * Prefers 8-digit passcodes; falls back to the title-like name line.
 */
export function parseMdproOcrText(text: string): MdproOcrParseResult {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const passcodes: number[] = [];
  const seen = new Set<number>();
  for (const line of rawLines) {
    PASSCODE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PASSCODE_RE.exec(line)) !== null) {
      const id = Number(match[1]);
      if (!seen.has(id)) {
        seen.add(id);
        passcodes.push(id);
      }
    }
  }

  const candidateName = pickCandidateName(rawLines);
  return { passcodes, candidateName, rawLines };
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
    // Skip type-only lines that MDPRO shows above spell/trap titles
    if (/^(normal|quick-?play|continuous|equip|field|ritual)\s+(spell|trap)$/i.test(line)) {
      continue;
    }
    if (/^(magia|trappola)\s+/i.test(line) && line.split(/\s+/).length <= 3) {
      continue;
    }
    // Skip pure passcode / slash-separated id lines
    if (/^[\d/\s]+$/.test(line)) {
      continue;
    }
    // Likely title: has letters, not too short
    if (/[A-Za-zÀ-ÿ]/.test(line) && line.length >= 3) {
      return cleanCardName(line);
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

/** Stable identity key for deduping live OCR lookups. */
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
