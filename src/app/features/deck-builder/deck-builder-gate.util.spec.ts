import { buildDeckIdentity, GateCardFacts, isAdmissible } from './deck-builder-gate.util';

const dragon: GateCardFacts = {
  id: 93717133,
  name: 'Galaxy-Eyes Photon Dragon',
  archetype: 'Galaxy-Eyes',
  setcodes: [4219, 85],
  type: 'Effect Monster', isExtraDeck: false, banTcg: null,
};
const knight: GateCardFacts = {
  id: 35950025,
  name: 'Galaxy Knight',
  archetype: 'Galaxy-Eyes',
  setcodes: [123],
  type: 'Effect Monster', isExtraDeck: false, banTcg: null,
};
const cyberLaserDragon: GateCardFacts = {
  id: 4162088,
  name: 'Cyber Laser Dragon',
  archetype: 'Photon',
  setcodes: [147],
  type: 'Effect Monster', isExtraDeck: false, banTcg: null,
};
const ashBlossom: GateCardFacts = {
  id: 14558127,
  name: 'Ash Blossom & Joyous Spring',
  archetype: null,
  setcodes: [],
  type: 'Effect Monster', isExtraDeck: false, banTcg: null,
};

describe('deck-builder gate', () => {
  describe('buildDeckIdentity', () => {
    it('collects the exact archetype strings and setcode families present in the deck', () => {
      const catalog = new Map([
        [dragon.id, dragon],
        [knight.id, knight],
      ]);
      const identity = buildDeckIdentity([{ id: dragon.id }, { id: knight.id }], catalog);
      expect(identity.archetypes.has('Galaxy-Eyes')).toBeTrue();
      expect(identity.setcodeFamilies.has(4219 & 0xfff)).toBeTrue();
      expect(identity.setcodeFamilies.has(123 & 0xfff)).toBeTrue();
    });

    it('ignores deck cards missing from the catalog instead of throwing', () => {
      const identity = buildDeckIdentity([{ id: 999999 }], new Map());
      expect(identity.archetypes.size).toBe(0);
      expect(identity.setcodeFamilies.size).toBe(0);
    });
  });

  describe('isAdmissible', () => {
    it('admits a card sharing the exact real archetype string', () => {
      const identity = buildDeckIdentity(
        [{ id: dragon.id }],
        new Map([[dragon.id, dragon]]),
      );
      expect(isAdmissible(knight, identity)).toBeTrue();
    });

    it('rejects a card whose archetype merely shares an English word with the deck (Photon != Galaxy-Eyes)', () => {
      // The exact bug class this gate replaces: Cyber Laser Dragon's real archetype is
      // "Photon" (2008 Cyber Dragon support), a different archetype than "Galaxy-Eyes"
      // even though both names contain the word "Photon". No text/name matching here.
      const identity = buildDeckIdentity(
        [{ id: dragon.id }, { id: knight.id }],
        new Map([[dragon.id, dragon], [knight.id, knight]]),
      );
      expect(isAdmissible(cyberLaserDragon, identity)).toBeFalse();
    });

    it('admits a card sharing a real setcode family even with a different archetype label', () => {
      const shared: GateCardFacts = {
        id: 1,
        name: 'Some Support Card',
        archetype: 'Different Archetype Name',
        setcodes: [4219],
        type: 'Spell Card', isExtraDeck: false, banTcg: null,
      };
      const identity = buildDeckIdentity([{ id: dragon.id }], new Map([[dragon.id, dragon]]));
      expect(isAdmissible(shared, identity)).toBeTrue();
    });

    it('admits a curated generic staple regardless of archetype/setcode', () => {
      const identity = buildDeckIdentity([{ id: dragon.id }], new Map([[dragon.id, dragon]]));
      expect(isAdmissible(ashBlossom, identity)).toBeTrue();
    });

    it('rejects a card with no archetype/setcode overlap and no staple allowlist entry', () => {
      const randomCard: GateCardFacts = {
        id: 2,
        name: 'Totally Unrelated Card',
        archetype: 'Some Other Archetype',
        setcodes: [999],
        type: 'Effect Monster', isExtraDeck: false, banTcg: null,
      };
      const identity = buildDeckIdentity([{ id: dragon.id }], new Map([[dragon.id, dragon]]));
      expect(isAdmissible(randomCard, identity)).toBeFalse();
    });

    it('admits any card when the deck has no identity yet (empty deck)', () => {
      const identity = buildDeckIdentity([], new Map());
      const randomCard: GateCardFacts = {
        id: 2,
        name: 'Anything',
        archetype: 'Anything',
        setcodes: [],
        type: 'Effect Monster', isExtraDeck: false, banTcg: null,
      };
      expect(isAdmissible(randomCard, identity)).toBeTrue();
    });
  });
});
