import { normalizeYrp3d } from './yrp3d-normalize';
describe('replay opening card normalization', () => {
  it('retains visible drawn codes and masks observer flags', () => {
    const replay = normalizeYrp3d({name0:'You',name1:'Other',masterRule:5,extractYrp:()=>null,messages:[
      {constructor:{name:'YGOProMsgStart'},playerType:0x10},
      {constructor:{name:'YGOProMsgDraw'},player:0,count:5,cards:[0x80000001,2,3,4,0]},
    ]}, {fileName:'test',sha256:'a',byteLength:10});
    expect(replay.focusController).toBe(0); expect(replay.events[0].cards).toEqual([1,2,3,4,0]);
  });
  it('attaches the deck by matching player name, not the host/client connection role, when the host played seat 1', () => {
    const replay = normalizeYrp3d({name0:'You',name1:'Other',masterRule:5,messages:[
      {constructor:{name:'YGOProMsgStart'},playerType:1},
    ],extractYrp:()=>({
      hostName:'Other',clientName:'You',
      hostDeck:{main:[111],extra:[],side:[]},
      clientDeck:{main:[222],extra:[],side:[]},
    })}, {fileName:'test',sha256:'a',byteLength:10});
    expect(replay.focusController).toBe(1);
    expect(replay.decks?.focus.main).toEqual([222]);
    expect(replay.decks?.opponent.main).toEqual([111]);
  });
  it('falls back to the seat heuristic when names cannot disambiguate host/client', () => {
    const replay = normalizeYrp3d({name0:'You',name1:'Other',masterRule:5,messages:[
      {constructor:{name:'YGOProMsgStart'},playerType:1},
    ],extractYrp:()=>({
      hostDeck:{main:[111],extra:[],side:[]},
      clientDeck:{main:[222],extra:[],side:[]},
    })}, {fileName:'test',sha256:'a',byteLength:10});
    expect(replay.decks?.focus.main).toEqual([222]);
  });
});
