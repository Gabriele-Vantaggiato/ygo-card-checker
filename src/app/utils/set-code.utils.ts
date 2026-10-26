import { CardLanguage } from '../models/collection.model';

export interface ParsedSetCode {
  /** Lookup order: the code as printed first, then its English equivalent. */
  candidates: string[];
  language: CardLanguage;
}

const REGION_LANGUAGE: Readonly<Record<string, CardLanguage>> = {
  EN: 'EN', E: 'EN',
  IT: 'IT', I: 'IT',
  FR: 'FR', F: 'FR',
  DE: 'DE', G: 'DE',
  SP: 'ES', S: 'ES',
  PT: 'PT', P: 'PT',
  JP: 'JP', J: 'JP',
  KR: 'KR', K: 'KR',
  AE: 'AE',
};

const SET_CODE_RE = /(?<![A-Z0-9])([A-Z0-9]{2,5})-([A-Z]{1,2})([0-9OIL]{3})(?![0-9A-Z])/;

/** Reads a printed set code (e.g. `LOB-EN005`) out of noisy OCR text. */
export function parseSetCode(text: string): ParsedSetCode | null {
  const normalized = text
    .toUpperCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\b([A-Z]{1,2})\s+([0-9OIL]{3})\b/g, '$1$2');

  const match = SET_CODE_RE.exec(normalized);
  if (!match) {
    return null;
  }

  const [, prefix, region, rawNumber] = match;
  const language = REGION_LANGUAGE[region];
  if (!language) {
    return null;
  }

  const number = rawNumber.replace(/O/g, '0').replace(/[IL]/g, '1');
  const printed = `${prefix}-${region}${number}`;
  const english = `${prefix}-EN${number}`;
  return { candidates: printed === english ? [printed] : [printed, english], language };
}
