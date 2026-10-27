import { parseAiCardJson } from './ai-card-json.utils';

describe('parseAiCardJson', () => {
  it('parses valid JSON', () => {
    expect(parseAiCardJson('{"name":"Dark Magician","setCode":"LOB-EN005","language":"en"}')).toEqual({
      name: 'Dark Magician',
      setCode: 'LOB-EN005',
      language: 'EN',
    });
  });

  it('parses fenced JSON', () => {
    const r = parseAiCardJson('```json\n{"name":"Blue-Eyes White Dragon","setCode":"SDK-001","language":null}\n```');
    expect(r.name).toBe('Blue-Eyes White Dragon');
  });

  it('parses JSON surrounded by prose', () => {
    const r = parseAiCardJson('Ecco il risultato: {"name":"Ash Blossom","setCode":"MACR-EN036","language":"EN"} spero aiuti.');
    expect(r).toEqual({ name: 'Ash Blossom', setCode: 'MACR-EN036', language: 'EN' });
  });

  it('returns all null on garbage', () => {
    const empty = { name: null, setCode: null, language: null };
    expect(parseAiCardJson('boh')).toEqual(empty);
    expect(parseAiCardJson('{not json}')).toEqual(empty);
    expect(parseAiCardJson('[1,2]')).toEqual(empty);
    expect(parseAiCardJson('')).toEqual(empty);
  });

  it('nulls an invalid set code but keeps the name', () => {
    const r = parseAiCardJson('{"name":"X","setCode":"hello","language":"EN"}');
    expect(r.setCode).toBeNull();
    expect(r.name).toBe('X');
  });

  it('trims and limits the name to 120 chars', () => {
    const r = parseAiCardJson(JSON.stringify({ name: `  ${'a'.repeat(200)}  `, setCode: null, language: null }));
    expect(r.name).toBe('a'.repeat(120));
  });
});
