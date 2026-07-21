import {
  cleanCardName,
  matchesKnownCard,
  mdproIdentityKey,
  parseMdproOcrText,
} from './mdpro-ocr-parse';

describe('parseMdproOcrText', () => {
  const blueEyesSample = `
Blue-Eyes White Dragon
8
ATK 3000
DEF 2500
OCG TCG G:0
[Dragon/Normal] [Blue-Eyes] [89631151/89631139]
This legendary dragon is a powerful engine of destruction.
Save Image
`;

  it('extracts passcodes and candidate name from MDPRO detail OCR', () => {
    const result = parseMdproOcrText(blueEyesSample);
    expect(result.passcodes).toEqual([89631151, 89631139]);
    expect(result.candidateName).toBe('Blue-Eyes White Dragon');
    expect(mdproIdentityKey(result)).toBe('id:89631151');
  });

  it('returns empty for blank input', () => {
    const result = parseMdproOcrText('   \n  ');
    expect(result.passcodes).toEqual([]);
    expect(result.candidateName).toBeNull();
    expect(mdproIdentityKey(result)).toBe('');
  });

  it('falls back to name when no passcode', () => {
    const result = parseMdproOcrText('Ash Blossom & Joyous Spring\nATK 0\nDEF 1800');
    expect(result.passcodes).toEqual([]);
    expect(result.candidateName).toBe('Ash Blossom & Joyous Spring');
    expect(mdproIdentityKey(result)).toBe('name:ashblossomjoyousspring');
  });

  it('skips spell/trap type labels and reads the real title', () => {
    const result = parseMdproOcrText(`
Spell Card
Normal Spell
Pot of Prosperity
[Spell Card]
[84211599]
`);
    expect(result.candidateName).toBe('Pot of Prosperity');
    expect(result.passcodes).toEqual([84211599]);
  });

  it('matches known card by passcode without re-fetch', () => {
    const result = parseMdproOcrText(blueEyesSample);
    expect(matchesKnownCard(result, 89631151, 'Blue-Eyes White Dragon')).toBeTrue();
    expect(matchesKnownCard(result, 99999999, 'Other')).toBeFalse();
  });
});
