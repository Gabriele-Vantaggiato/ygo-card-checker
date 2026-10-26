import { bestNameMatch, buildNameQueries, canonicalizeName, cleanOcrName, normalizeName, similarity } from './name-match.utils';

describe('name-match utils', () => {
  it('cleanOcrName picks the line with the most letters', () => {
    expect(cleanOcrName('  \n Dark Magician \n 2500')).toBe('Dark Magician');
  });

  it('cleanOcrName returns null when nothing readable', () => {
    expect(cleanOcrName(' \n 12 \n')).toBeNull();
  });

  it('normalizeName strips accents, case and punctuation', () => {
    expect(normalizeName('Éclair-Dragon!')).toBe('eclair dragon');
  });

  it('similarity is 1 for equal names and drops with edits', () => {
    expect(similarity('Dark Magician', 'dark magician')).toBe(1);
    expect(similarity('Dark Magicjan', 'Dark Magician')).toBeGreaterThan(0.85);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('bestNameMatch returns the closest card above the threshold', () => {
    const cards = [{ name: 'Dark Magician' }, { name: 'Dark Magician Girl' }];
    expect(bestNameMatch('Dark Magicjan', cards)).toEqual({ name: 'Dark Magician' });
  });

  it('bestNameMatch returns null below the threshold', () => {
    expect(bestNameMatch('Blue-Eyes', [{ name: 'Dark Magician' }])).toBeNull();
  });

  it('canonicalizeName collapses noisy variants onto the first-seen spelling', () => {
    const recent: string[] = [];
    for (const raw of ['dark magicjan', 'dark maglcian', 'dark magician']) {
      const canonical = canonicalizeName(normalizeName(raw), recent);
      recent.push(canonical);
      expect(canonical).toBe('dark magicjan');
    }
  });

  it('canonicalizeName keeps a different name separate', () => {
    expect(canonicalizeName('blue eyes white dragon', ['dark magicjan'])).toBe('blue eyes white dragon');
  });

  it('canonicalizeName handles empty input', () => {
    expect(canonicalizeName('', [])).toBe('');
    expect(canonicalizeName('  ', ['dark magician'])).toBe('');
  });

  it('buildNameQueries returns the full text then the longest distinct words', () => {
    expect(buildNameQueries('Dark Magician of Chaos')).toEqual(['Dark Magician of Chaos', 'Magician', 'Chaos', 'Dark']);
  });

  it('buildNameQueries dedupes, ignores short words and handles empty', () => {
    expect(buildNameQueries('Red Red Dragon')).toEqual(['Red Red Dragon', 'Dragon']);
    expect(buildNameQueries('')).toEqual([]);
  });
});
