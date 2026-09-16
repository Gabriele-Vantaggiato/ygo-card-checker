import { associateReplayDeck, buildReplayFlow } from './replay-flow';
import { lineReplay } from '../../../testing/replay-line.fixtures';
import { Decklist } from '../../../models/decklist.model';
import { isYgoFlowDocument } from '../../ygo-flow/services/ygo-flow-io.service';
import { YgoCard } from '../../../models/ygo-card.model';
const deck: Decklist = {id:'deck',name:'My deck',updatedAt:new Date().toISOString(),cards:[1,2,3,4,5,6,7].map(id=>({id,name:`Card ${id}`,type:'Effect Monster',imageUrlSmall:null,quantity:1,section:id===7?'extra':'main'}))};
const card = (id: number): YgoCard => ({id,name:`Card ${id}`,type:'Effect Monster',desc:'',card_images:[]});
describe('replay to Flow',()=>{
  it('preserves observed order, repeated cards, deck snapshot and editable nodes',()=>{
    const replay=lineReplay(); const before=JSON.stringify(replay);
    const doc=buildReplayFlow(replay,1,deck,card,String,'unknown')!;
    expect(isYgoFlowDocument(doc)).toBeTrue();
    expect(doc.canvas.nodes.map(n=>n.cardId)).toEqual([1,1,7]);
    expect(doc.canvas.edges.length).toBe(2);expect(doc.context!.deckId).toBe('deck');
    expect(doc.cards!.length).toBe(7);expect(JSON.stringify(replay)).toBe(before);
    expect(buildReplayFlow(replay,1,deck,card,String,'unknown')!.id).not.toBe(doc.id);
  });
  it('rejects mismatched embedded decks without rewriting evidence',()=>{
    expect(associateReplayDeck(lineReplay(),{...deck,cards:deck.cards.slice(1)})).toBeNull();
    expect(buildReplayFlow(lineReplay(),1,{...deck,cards:[]},card,String,'unknown')).toBeNull();
  });
  it('uses selected deck only when compatible with visible opening cards',()=>{
    const replay=lineReplay({decks:null,hasEmbeddedYrp:false});
    expect(associateReplayDeck(replay,deck)!.decks!.focus.main).toEqual([1,2,3,4,5,6]);
    expect(associateReplayDeck(replay,{...deck,cards:deck.cards.slice(1)})).toBeNull();
    expect(buildReplayFlow(lineReplay(),9,deck,card,String,'unknown')).toBeNull();
  });
});
