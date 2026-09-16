import { Decklist } from '../../../models/decklist.model';
import { ParsedReplay } from '../../../models/replay.model';
import { FlowNode, YgoFlowDocument } from '../../../models/ygo-flow.model';
import { YgoCard } from '../../../models/ygo-card.model';
import { passcodesToBase64, splitDeckIntoYdkeSections } from '../../../services/ydke.service';
import { deckKey, replayAction } from '../../../utils/replay-lines';

export function associateReplayDeck(replay: ParsedReplay, deck: Decklist): ParsedReplay | null {
  const sections = splitDeckIntoYdkeSections(deck.cards);
  if (!sections.main.length) return null;
  const openingDraw = replay.events.find(e=>e.kind==='draw' && e.controller===replay.focusController && (e.cards?.length ?? 0)>=5);
  if (!replay.decks && openingDraw?.cards) {
    const available=[...sections.main];
    for (const id of openingDraw.cards.filter(id=>id>0)) {
      const at=available.indexOf(id); if (at<0) return null; available.splice(at,1);
    }
  }
  if (replay.decks && deckKey(replay.decks.focus) !== deckKey(sections)) return null;
  return { ...replay, decks: replay.decks ?? {focus:sections,opponent:{main:[],extra:[],side:[]}} };
}
export function replayFlowTurns(replay: ParsedReplay): number[] {
  return [...new Set(replay.events.filter(e => e.controller === replay.focusController && replayAction(e) && (e.turn ?? 0) > 0).map(e => e.turn!))];
}
export function buildReplayFlow(replay: ParsedReplay, turn: number, selected: Decklist | null,
  resolveCard: (id: number) => YgoCard, label: (kind: string) => string, formatId: string): YgoFlowDocument | null {
  if (!replay.decks || (selected && !associateReplayDeck(replay,selected))) return null;
  const events = replay.events.filter(e => e.turn === turn && e.controller === replay.focusController);
  const actions = events.map(replayAction).filter(a => a !== null);
  if (!actions.length || actions.length > 500) return null;
  const nodes: FlowNode[] = actions.map((action,i) => {
    const card = resolveCard(action.cardId);
    return {id:`replay-${i}`,cardId:card.id,card,name:card.name,action:label(action.kind),
      imageSmall:card.card_images[0]?.image_url_small ?? '',kind:i===0?'start':'action',
      x:80+(i%5)*300,y:80+Math.floor(i/5)*270,interrupts:[],
      notes:`${replay.fileName} · T${turn} · ${label('observed')}`};
  });
  const sections = replay.decks.focus;
  const cards = [...new Set([...sections.main,...sections.extra,...sections.side,...actions.map(a=>a.cardId)])].map(resolveCard);
  const stamp = new Date().toISOString();
  return {version:2,id:`replay-${replay.sha256.slice(0,16)}-${turn}-${crypto.randomUUID()}`,name:`${selected?.name ?? replay.focusName} · T${turn}`.slice(0,200),
    ydke:`ydke://${[sections.main,sections.extra,sections.side].map(passcodesToBase64).join('!')}!`,
    cards,roles:{},savedAt:stamp,
    context:{deckId:selected?.id ?? null,deckName:selected?.name ?? replay.fileName,deckUpdatedAt:selected?.updatedAt ?? stamp,formatId,banlistDate:null},
    canvas:{nodes,edges:nodes.slice(1).map((n,i)=>({id:`edge-${i}`,from:nodes[i].id,to:n.id})),zoom:1,panX:0,panY:0}};
}
