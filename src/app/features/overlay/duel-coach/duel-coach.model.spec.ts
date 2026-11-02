import { CoachRoute, compareMoves, eligibleWithHand, routeFitsDeck, routeMoves, sameDeck, validDeck } from './duel-coach.model';
import { activeDeckName, parseYdk } from './mdpro-directory.service';
import { ydkeSectionsToUrl } from '../../../services/ydke.service';

export const routeFixture = (): CoachRoute => ({ id: 'route',title: 'Two-card route',source: 'test',deckTargets: { '3': 1 },guide: {
  id: 'guide',title: 'Two-card route',description: 'Requires a target still in Deck.',startingCards: [1,2],requiredCards: [1,2,3,9],endCards: [9],playsAround: [],
  steps: [{ title: 'Summon',text: 'Summon the starter.',kind: 'summon',cards: [1],flow: [{ card: 1,action: 'normal-summon',caption: 'Starter',zone: 'field',join: 'none' }] },
    { title: 'Activate',text: 'Activate the starter.',kind: 'effect',cards: [1],flow: [{ card: 1,action: 'activate',caption: 'Activate',zone: 'field',join: 'none' }] },
    { title: 'Summon again',text: 'A repeated action is retained.',kind: 'summon',cards: [1],flow: [{ card: 1,action: 'normal-summon',caption: 'Repeat',zone: 'field',join: 'none' }] }],
} });
describe('Duel coach matching and ordering', () => {
  const deck = { main: [1,2,3,4,5,6],extra: [9],side: [10] };
  it('reads the actual selected native deck, with CRLF and without traversing paths', () => {
    expect(activeDeckName('DeckInUse->Zombie\r\n')).toBe('Zombie');
    for (const name of ['../secret','..','C:\\Deck','a/b']) expect(() => activeDeckName(`DeckInUse->${name}`)).toThrow();
  });
  it('preserves Main, Extra, Side and repeated copies in native YDK', () => {
    expect(parseYdk('#created by MDPro4\n#main\n1\n1\n2\n#extra\n9\n!side\n10')).toEqual({ main: [1,1,2],extra: [9],side: [10] });
    expect(() => parseYdk('#main\n1\n../../file')).toThrow();
  });
  it('rejects malformed, truncated and oversized YDKE without partial imports', () => {
    expect(validDeck(ydkeSectionsToUrl(deck))).toEqual(deck);
    for (const input of ['ydke://AQ==!!!','ydke://!!!!','ydke://!','ydke://YWJj!!!!',ydkeSectionsToUrl({ ...deck,extra: Array(16).fill(9) })]) expect(() => validDeck(input)).toThrow();
  });
  it('compares exact quantities and all three sections independently of order', () => {
    expect(sameDeck(deck,{ ...deck,main: [...deck.main].reverse() })).toBeTrue();
    expect(sameDeck(deck,{ ...deck,side: [] })).toBeFalse();
    expect(sameDeck(deck,{ ...deck,main: [1,1,2,3,4,5,6] })).toBeFalse();
  });
  it('does not satisfy a Main/Extra requirement with a Side card or a missing second copy', () => {
    const route = routeFixture();
    expect(routeFitsDeck(route.guide,deck)).toBeTrue();
    expect(routeFitsDeck({ ...route.guide,requiredCards: [10] },deck)).toBeFalse();
    expect(routeFitsDeck({ ...route.guide,requiredCards: [3,3] },deck)).toBeFalse();
  });
  it('reserves Deck targets after subtracting the real opening hand', () => {
    expect(eligibleWithHand(routeFixture(),[1,2,4,5,6],deck)).toBeTrue();
    expect(eligibleWithHand(routeFixture(),[1,2,3,4,5],deck)).toBeFalse();
    const route = routeFixture(); route.guide.startingCards = [1,1,0];
    expect(eligibleWithHand(route,[1,2,4,5,6],deck)).toBeFalse();
    expect(eligibleWithHand(route,[1,1],deck)).toBeFalse();
  });
  it('keeps repeated actions, catches an out-of-order action, and does not resync past deviations', () => {
    const moves = routeMoves(routeFixture());
    expect(moves.map(m => m.action)).toEqual(['normal-summon','activate','normal-summon']);
    expect(compareMoves(moves,moves)).toEqual({ matched: 3,nextIndex: 3,status: 'complete' });
    expect(compareMoves(moves,[moves[0],moves[2],moves[1]])).toEqual({ matched: 1,nextIndex: 1,status: 'deviation' });
    expect(compareMoves(moves,[...moves,moves[0]]).status).toBe('deviation');
  });
  it('never derives a summon from explanatory prose', () => {
    const route = routeFixture(); route.guide.steps = [{ title: 'Text',text: 'Special summon three times.',kind: 'effect',cards: [1] }];
    expect(routeMoves(route)[0].action).toBe('instruction');
  });
  it('keeps Foolish Burial resolution before the Normal Summon and rejects the wrong target', () => {
    const route = routeFixture();
    route.guide.steps = [
      { title: 'Foolish',text: 'Send Plaguespreader.',kind: 'effect',cards: [81439173,33420078],flow: [
        { card: 81439173,action: 'activate',caption: '',zone: 'field',join: 'none' },
        { card: 33420078,action: 'send',caption: 'Send Plaguespreader',zone: 'graveyard',join: 'arrow' }] },
      { title: 'Normal',text: 'Normal summon Goblin.',kind: 'summon',cards: [63665875],flow: [{ card: 63665875,action: 'normal-summon',caption: '',zone: 'field',join: 'none' }] },
    ];
    const moves = routeMoves(route), afterActivation = compareMoves(moves,[moves[0]]);
    expect(moves[afterActivation.nextIndex].cardId).toBe(33420078);
    expect(moves[afterActivation.nextIndex].action).toBe('send');
    expect(compareMoves(moves,[moves[0],{ ...moves[1],cardId: 92826944 }]).status).toBe('deviation');
    expect(compareMoves(moves,[moves[0],moves[1]]).nextIndex).toBe(2);
  });
  it('follows the six actions actually recorded by MDPro4 through Plaguespreader activation, cost and summon', async () => {
    const recipes: { key: string; guide: CoachRoute['guide'] }[] = await fetch('/assets/data/combo-sheets/deck-recipes.json').then(r => r.json());
    const route = { ...routeFixture(),guide: recipes.find(r => r.key === 'foolish-goblin-5309481')!.guide };
    const recorded = ([[81439173,'activate'],[33420078,'send'],[63665875,'normal-summon'],
      [33420078,'activate'],[69257165,'return'],[33420078,'special-summon']] as const)
      .map(([cardId,action]) => ({ cardId,action,label: '',detail: '' }));
    const expected = routeMoves(route);
    const cost = compareMoves(expected,recorded.slice(0,4));
    expect(cost.status).toBe('following');
    expect(expected[cost.nextIndex].action).toBe('return');
    expect(expected[compareMoves(expected,recorded.slice(0,5)).nextIndex].action).toBe('special-summon');
    expect(compareMoves(expected,recorded)).toEqual({ matched: 6,nextIndex: 6,status: 'following' });
  });
  it('allows the two material movements within one Synchro step in either order', () => {
    const route = routeFixture(); route.guide.steps = [{ title: 'Synchro',text: 'Use the materials.',kind: 'summon',cards: [1,2,9],flow: [
      { card: 1,action: 'banish',caption: '',zone: 'banished',join: 'none' },
      { card: 2,action: 'send',caption: '',zone: 'graveyard',join: 'plus' },
      { card: 9,action: 'special-summon',caption: '',zone: 'field',join: 'arrow' },
    ] }];
    const moves = routeMoves(route);
    expect(compareMoves(moves,[moves[1]]).nextIndex).toBe(0);
    expect(compareMoves(moves,[moves[1],moves[0],moves[2]]).status).toBe('complete');
  });
});
