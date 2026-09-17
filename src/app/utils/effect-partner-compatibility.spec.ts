import { effectPartnersCompatible } from './effect-partner-compatibility';
import { EffectScript } from '../models/effect-script.model';
import { CardKnowledgeEntry } from '../models/card-knowledge.model';
import { isCompatibleMonsterPartner } from './script-deck-synergy.utils';
const entry=(race:string):CardKnowledgeEntry=>({race,type:'Effect Monster',tags:['gy_effect'],series:[],mentions:[],effects:[],related:[]});
const mezuki:EffectScript={cardId:92826944,name:'Mezuki',roles:[],interrupts:[],timings:[],steps:[{id:'revive',when:'gy',actions:[{op:'ss',from:'gy',to:'monster',filter:'Zombie monster',qty:1}]}],luaSource:'',source:'hat',confidence:1};
describe('restricted graveyard partners',()=>{
 it('rejects non-Zombie monsters in both directions despite common GY tags',()=>{
   expect(effectPartnersCompatible(entry('Zombie'),entry('Aqua'),mezuki)).toBeFalse();
   expect(effectPartnersCompatible(entry('Sea Serpent'),entry('Zombie'),undefined,mezuki)).toBeFalse();
   expect(effectPartnersCompatible(entry('Zombie'),entry('Zombie'),mezuki)).toBeTrue();
 });
 it('keeps generic spell enablers and does not guess unsupported constraints',()=>{
   expect(effectPartnersCompatible(entry('Zombie'),{...entry('Normal'),type:'Spell Card'},mezuki)).toBeTrue();
   expect(effectPartnersCompatible(entry('Zombie'),entry('Aqua'))).toBeTrue();
 });
 it('exempts a candidate that mills from its own Deck to the GY, regardless of race',()=>{
   const deckMillEnabler:EffectScript={cardId:1,name:'Deck mill enabler',roles:[],interrupts:[],timings:[],steps:[{id:'mill',when:'trigger',actions:[{op:'mill',from:'deck',to:'gy',qty:1}]}],luaSource:'',source:'hat',confidence:1};
   expect(effectPartnersCompatible(entry('Zombie'),entry('Warrior'),mezuki,deckMillEnabler)).toBeTrue();
 });
 it('still rejects a wrong-race monster that only discards from hand as its own cost',()=>{
   const handCostSelfSummon:EffectScript={cardId:2,name:'Hand cost self SS',roles:[],interrupts:[],timings:[],steps:[{id:'ss',when:'activate',actions:[{op:'discard',from:'hand',to:'gy',qty:2}]}],luaSource:'',source:'hat',confidence:1};
   expect(effectPartnersCompatible(entry('Zombie'),entry('Aqua'),mezuki,handCostSelfSummon)).toBeFalse();
 });
 it('does not waive race compatibility for the name Mezuki',()=>{
   expect(isCompatibleMonsterPartner({id:92826944,name:'Mezuki',type:'Effect Monster',race:'Zombie',archetype:null,tcgDate:null,banTcg:null,imageSmall:''},new Set(['aqua','sea serpent']))).toBeFalse();
 });
 it('does not let a flavor word in the name override a known, mismatched race (Cyber Laser Dragon is Machine, not Dragon)',()=>{
   expect(isCompatibleMonsterPartner({id:4162088,name:'Cyber Laser Dragon',type:'Effect Monster',race:'Machine',archetype:'Photon',tcgDate:null,banTcg:null,imageSmall:''},new Set(['dragon','warrior']))).toBeFalse();
 });
 it('still uses the name/archetype fallback when the candidate race is genuinely unknown',()=>{
   expect(isCompatibleMonsterPartner({id:1,name:'Some Dragon Support',type:'Effect Monster',race:null,archetype:null,tcgDate:null,banTcg:null,imageSmall:''},new Set(['dragon']))).toBeTrue();
 });
});
