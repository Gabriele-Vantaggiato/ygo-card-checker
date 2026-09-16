import assert from 'node:assert/strict';
import { parseMdproLua } from './mdpro-lua-parser';

// Armageddon Knight-shaped: mills 1 DARK monster from Deck to GY as its whole effect.
const deckMillLua = `
function c1.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_TOGRAVE)
  e1:SetCode(EVENT_SUMMON_SUCCESS)
  e1:SetTarget(c1.target)
  e1:SetOperation(c1.operation)
  c:RegisterEffect(e1)
end
function c1.tgfilter(c) return c:IsAttribute(ATTRIBUTE_DARK) and c:IsAbleToGrave() end
function c1.target(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return Duel.IsExistingMatchingCard(c1.tgfilter,tp,LOCATION_DECK,0,1,nil) end
  Duel.SetOperationInfo(0,CATEGORY_TOGRAVE,nil,1,tp,LOCATION_DECK)
end
function c1.operation(e,tp,eg,ep,ev,re,r,rp)
  local g=Duel.SelectMatchingCard(tp,c1.tgfilter,tp,LOCATION_DECK,0,1,1,nil)
  Duel.SendtoGrave(g,REASON_EFFECT)
end
`;
const millResult = parseMdproLua(1, 'Armageddon Knight-like', deckMillLua);
assert.equal(millResult.steps.length, 1);
assert.equal(millResult.steps[0].actions[0].op, 'mill');
assert.equal(millResult.steps[0].actions[0].from, 'deck');
assert.equal(millResult.steps[0].actions[0].to, 'gy');
assert.ok(millResult.roles.includes('engine'));

// Mermail Abyssmegalo-shaped: discards from HAND as a cost to special summon itself.
// Must NOT be classified as a deck mill.
const handCostSsLua = `
function c2.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_SPECIAL_SUMMON)
  e1:SetRange(LOCATION_HAND)
  e1:SetCost(c2.spcost)
  c:RegisterEffect(e1)
end
function c2.cfilter(c) return c:IsAttribute(ATTRIBUTE_WATER) and c:IsAbleToGraveAsCost() end
function c2.spcost(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return Duel.IsExistingMatchingCard(c2.cfilter,tp,LOCATION_HAND,0,2,nil) end
  Duel.DiscardHand(tp,c2.cfilter,2,2,REASON_COST+REASON_DISCARD)
end
`;
const handCostResult = parseMdproLua(2, 'Mermail-like', handCostSsLua);
assert.ok(!handCostResult.steps.some((s) => s.actions.some((a) => a.op === 'mill')));

console.log('mdpro-lua-parser.test.ts OK');
