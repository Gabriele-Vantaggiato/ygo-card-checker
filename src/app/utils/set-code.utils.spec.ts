import { parseSetCode } from './set-code.utils';

describe('parseSetCode', () => {
  it('parses a modern English code', () => {
    expect(parseSetCode('LOB-EN005')).toEqual({ candidates: ['LOB-EN005'], language: 'EN' });
  });

  it('adds the English equivalent for other languages', () => {
    expect(parseSetCode('SDY-IT006')).toEqual({ candidates: ['SDY-IT006', 'SDY-EN006'], language: 'IT' });
  });

  it('parses legacy single-letter regions', () => {
    expect(parseSetCode('LOB-I005')).toEqual({ candidates: ['LOB-I005', 'LOB-EN005'], language: 'IT' });
  });

  it('tolerates case and spaces around separators', () => {
    expect(parseSetCode('lob - en 005')?.candidates[0]).toBe('LOB-EN005');
  });

  it('fixes O/I/L confusions inside the number', () => {
    expect(parseSetCode('LOB-ENOO5')?.candidates[0]).toBe('LOB-EN005');
    expect(parseSetCode('LOB-ENO1L')?.candidates[0]).toBe('LOB-EN011');
  });

  it('ignores surrounding words', () => {
    expect(parseSetCode('1ST EDITION LOB-EN005\nfoo')?.candidates[0]).toBe('LOB-EN005');
  });

  it('accepts four-character prefixes', () => {
    expect(parseSetCode('RA01-EN001')?.candidates[0]).toBe('RA01-EN001');
  });

  it('returns null for unknown regions, short numbers and noise', () => {
    expect(parseSetCode('LOB-XX005')).toBeNull();
    expect(parseSetCode('LOB-EN05')).toBeNull();
    expect(parseSetCode('hello world')).toBeNull();
    expect(parseSetCode('')).toBeNull();
  });
});
