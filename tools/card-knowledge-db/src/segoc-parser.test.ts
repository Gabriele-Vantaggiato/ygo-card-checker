import assert from 'node:assert/strict';
import { parseSegocProfile, deriveSpellSpeed } from './segoc-parser';

// Trigger effect with a "when" condition (no EFFECT_FLAG_DELAY) — Missed Timing risk.
const whenTrigger = `
local e1=Effect.CreateEffect(c)
e1:SetDescription(aux.Stringid(11662742,0))
e1:SetCategory(CATEGORY_TOLIFE)
e1:SetType(EFFECT_TYPE_TRIGGER_F)
e1:SetCode(EVENT_DESTROYED)
e1:SetRange(LOCATION_MZONE)
e1:SetCondition(c1.condition)
e1:SetOperation(c1.operation)
c:RegisterEffect(e1)
`;
const whenResult = parseSegocProfile(whenTrigger);
assert.equal(whenResult.effectType, 'trigger');
assert.equal(whenResult.missedTimingRisk, true);
assert.deepEqual(whenResult.triggerEvents, ['destroyed']);

// Trigger effect with EFFECT_FLAG_DELAY in the same block — "if" condition, no risk.
const ifTrigger = `
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_TRIGGER_O)
e1:SetCode(EVENT_TO_GRAVE)
e1:SetProperty(EFFECT_FLAG_DELAY)
e1:SetRange(LOCATION_GRAVE)
c:RegisterEffect(e1)
`;
const ifResult = parseSegocProfile(ifTrigger);
assert.equal(ifResult.effectType, 'trigger');
assert.equal(ifResult.missedTimingRisk, false);
assert.deepEqual(ifResult.triggerEvents, ['to_grave']);

// Ignition effect — not a trigger, no Missed Timing concept applies.
const ignition = `
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_IGNITION)
e1:SetRange(LOCATION_MZONE)
e1:SetCost(c1.cost)
e1:SetOperation(c1.operation)
c:RegisterEffect(e1)
`;
const ignitionResult = parseSegocProfile(ignition);
assert.equal(ignitionResult.effectType, 'ignition');
assert.equal(ignitionResult.missedTimingRisk, false);
assert.deepEqual(ignitionResult.triggerEvents, []);

// Multiple effect blocks: TRIGGER_F when + TRIGGER_O if in the same card — per-block scoping.
const mixedBlocks = `
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_TRIGGER_F)
e1:SetCode(EVENT_DESTROYED)
c:RegisterEffect(e1)
local e2=Effect.CreateEffect(c)
e2:SetType(EFFECT_TYPE_TRIGGER_O)
e2:SetCode(EVENT_TO_GRAVE)
e2:SetProperty(EFFECT_FLAG_DELAY)
c:RegisterEffect(e2)
`;
const mixedResult = parseSegocProfile(mixedBlocks);
// effectType picks the most SEGOC-relevant across blocks: TRIGGER present, so 'trigger'.
assert.equal(mixedResult.effectType, 'trigger');
// missedTimingRisk is true if ANY trigger block on the card is a "when" (risk exists on this card).
assert.equal(mixedResult.missedTimingRisk, true);
assert.deepEqual(mixedResult.triggerEvents, ['destroyed', 'to_grave']);

// No effect blocks at all (vanilla monster) — 'none', no risk, no events.
const vanilla = `
function c11111111.initial_effect(c)
end
`;
const vanillaResult = parseSegocProfile(vanilla);
assert.equal(vanillaResult.effectType, 'none');
assert.equal(vanillaResult.missedTimingRisk, false);
assert.deepEqual(vanillaResult.triggerEvents, []);

// Quick effect (monster quick effect via QUICK_O) — 'quick', no Missed Timing concept.
const quickMonster = `
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_QUICK_O)
e1:SetRange(LOCATION_MZONE)
c:RegisterEffect(e1)
`;
const quickResult = parseSegocProfile(quickMonster);
assert.equal(quickResult.effectType, 'quick');
assert.equal(quickResult.missedTimingRisk, false);

// Spell Speed derivation — never read from Lua (verified: not a real Lua constant), always
// derived from the card's type string + its already-extracted effectType.
assert.equal(deriveSpellSpeed('Counter Trap Card', 'activate'), 3);
assert.equal(deriveSpellSpeed('Quick-Play Spell Card', 'activate'), 2);
assert.equal(deriveSpellSpeed('Normal Trap Card', 'activate'), 2);
assert.equal(deriveSpellSpeed('Continuous Trap Card', 'continuous'), 2);
assert.equal(deriveSpellSpeed('Effect Monster', 'quick'), 2); // monster quick effect (QUICK_O/F)
assert.equal(deriveSpellSpeed('Effect Monster', 'trigger'), 1);
assert.equal(deriveSpellSpeed('Normal Monster', 'none'), null); // vanilla, no effect block
assert.equal(deriveSpellSpeed('Spell Card', 'activate'), 1); // Normal Spell

console.log('segoc-parser.test.ts OK');
