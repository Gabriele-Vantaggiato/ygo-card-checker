/**
 * LLM-backed implementation of CardSemanticParserService (see semantic-parser.ts for the
 * free, instant regex-based default that stays the default). Calls the Gemini API directly
 * at build time using a server-side GEMINI_API_KEY — this is a Node CLI script, never
 * exposed to the browser, unlike gemini-dev-proxy.mjs / api/gemini/[...path].ts which relay
 * a browser-supplied BYOK key for the in-app Gemini coach.
 */
import {
  CARD_OUTCOMES,
  CARD_ROLES,
  CARD_TRIGGERS,
  type CardCostFlags,
  type CardOutcome,
  type CardRestrictions,
  type CardRole,
  type CardTrigger,
  type SemanticProfile,
} from './semantic-model';
import type { CardSemanticParserInput, CardSemanticParserService } from './semantic-parser';

/**
 * Delay between consecutive Gemini calls (ms), so the build script doesn't hammer the API.
 * Named constant so it's easy to tune later; consumed by tag-semantic.ts's --source=llm loop.
 */
export const RATE_LIMIT_DELAY_MS = 200;

// gemini-2.5-flash is the current stable flash model (successor to the 2.0 line referenced
// in tools/gemini-dev-proxy.mjs's example URL) — cheap and fast enough for per-card tagging.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CARD_ROLES_SET: ReadonlySet<string> = new Set(CARD_ROLES);
const CARD_TRIGGERS_SET: ReadonlySet<string> = new Set(CARD_TRIGGERS);
const CARD_OUTCOMES_SET: ReadonlySet<string> = new Set(CARD_OUTCOMES);

const RESTRICTION_KEYS = [
  'restrictsSummonToAttribute',
  'restrictsSummonToRace',
  'restrictsSummonToType',
  'restrictsSummonToArchetype',
] as const;

/**
 * Raw shape the LLM is asked to return. `mentionedCardNames` is EXTRA beyond SemanticProfile
 * — plain strings, not ids. Name→id resolution already happens elsewhere (build-relations.ts's
 * card_mentions matching pass), so parseAsync() discards this field before returning.
 */
interface LlmSemanticResponse {
  roles?: unknown;
  triggers?: unknown;
  outcomes?: unknown;
  costFlags?: unknown;
  restrictions?: unknown;
  mentionedCardNames?: unknown;
}

function buildPrompt(input: CardSemanticParserInput): string {
  return `You are a Yu-Gi-Oh! Trading Card Game rules expert, tagging a card with a fixed semantic vocabulary for a deckbuilding tool.

## Problem-Solving Card Text (PSCT) conventions
Yu-Gi-Oh! card text follows strict PSCT rules:
- Text BEFORE a colon (":") is the activation CONDITION or TIMING — when/how the effect can be used.
- If there is a semicolon (";"), the text BETWEEN the colon and the semicolon is the COST, paid immediately on activation before anything else resolves.
- Text AFTER the semicolon (or after the colon, if there is no semicolon) is the EFFECT/OUTCOME — what actually happens.
- Trigger effects are introduced by "When" (an event just happened) or "If" (a condition/event-based check) and fire off a specific event.
- Ignition effects have no trigger wording — they simply describe something a player CAN do (usually starting "You can"), activatable any time you could activate a Normal Spell, on your turn during your Main Phase.
- Quick Effects are explicitly marked "(Quick Effect)" and can be activated on either player's turn, including in response to other activations/effects.

## Card to analyze
Name: ${input.name}
Archetype: ${input.archetype ?? '(none)'}
Card text (English):
"""
${input.descEn}
"""

## Task
Return a single JSON object with these exact fields:
- "roles": zero or more values from this closed list: ${JSON.stringify(CARD_ROLES)}
- "triggers": zero or more values from this closed list: ${JSON.stringify(CARD_TRIGGERS)}
- "outcomes": zero or more values from this closed list: ${JSON.stringify(CARD_OUTCOMES)}
- "costFlags": object { "discardsForCost": boolean, "tributesForCost": boolean, "banishesForCost": boolean }
- "restrictions": object with zero or more optional string fields: "restrictsSummonToAttribute", "restrictsSummonToRace", "restrictsSummonToType", "restrictsSummonToArchetype" (omit any that don't apply)
- "mentionedCardNames": array of exact card names (plain strings, e.g. "Dark Magician") explicitly named in quotes in the card text, excluding this card's own name. Do NOT resolve these to ids.

Only use values from the closed lists above — never invent new roles/triggers/outcomes. Base every field strictly on the card text and standard PSCT interpretation. Respond with JSON only, matching this schema.`;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    roles: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: [...CARD_ROLES] },
    },
    triggers: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: [...CARD_TRIGGERS] },
    },
    outcomes: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: [...CARD_OUTCOMES] },
    },
    costFlags: {
      type: 'OBJECT',
      properties: {
        discardsForCost: { type: 'BOOLEAN' },
        tributesForCost: { type: 'BOOLEAN' },
        banishesForCost: { type: 'BOOLEAN' },
      },
      required: ['discardsForCost', 'tributesForCost', 'banishesForCost'],
    },
    restrictions: {
      type: 'OBJECT',
      properties: {
        restrictsSummonToAttribute: { type: 'STRING' },
        restrictsSummonToRace: { type: 'STRING' },
        restrictsSummonToType: { type: 'STRING' },
        restrictsSummonToArchetype: { type: 'STRING' },
      },
    },
    mentionedCardNames: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: ['roles', 'triggers', 'outcomes', 'costFlags', 'restrictions', 'mentionedCardNames'],
} as const;

function filterValid<T extends string>(values: unknown, allowed: ReadonlySet<string>, label: string): T[] {
  if (!Array.isArray(values)) return [];
  const result: T[] = [];
  for (const value of values) {
    if (typeof value === 'string' && allowed.has(value)) {
      result.push(value as T);
    } else {
      console.warn(`[semantic-parser-llm] dropping invalid ${label} value: ${JSON.stringify(value)}`);
    }
  }
  return result;
}

function sanitizeCostFlags(raw: unknown): CardCostFlags {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    discardsForCost: obj.discardsForCost === true,
    tributesForCost: obj.tributesForCost === true,
    banishesForCost: obj.banishesForCost === true,
  };
}

function sanitizeRestrictions(raw: unknown): CardRestrictions {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const restrictions: CardRestrictions = {};
  for (const key of RESTRICTION_KEYS) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      restrictions[key] = value;
    }
  }
  return restrictions;
}

/**
 * LLM-backed CardSemanticParserService. The shared interface's parse() is synchronous
 * (matching the regex parser), but a real Gemini call is inherently async, so parse()
 * throws an explicit error here and the real work lives in parseAsync() instead — a
 * deliberate interface note (documented on both members), not a violation to hide.
 */
export class LlmCardSemanticParser implements CardSemanticParserService {
  /** Synchronous per CardSemanticParserService, but Gemini calls are async — use parseAsync(). */
  parse(): SemanticProfile {
    throw new Error(
      'LlmCardSemanticParser.parse() is not supported: Gemini calls are async. Use parseAsync() instead.',
    );
  }

  async parseAsync(input: CardSemanticParserInput): Promise<SemanticProfile> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set.');
    }

    let response: Response;
    try {
      response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });
    } catch (error) {
      throw new Error(
        `Gemini API request failed for card "${input.name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(
        `Gemini API returned ${response.status} ${response.statusText} for card "${input.name}": ${bodyText}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(
        `Gemini API returned invalid JSON envelope for card "${input.name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates
      ?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error(`Gemini API returned no text content for card "${input.name}": ${JSON.stringify(payload)}`);
    }

    let parsed: LlmSemanticResponse;
    try {
      parsed = JSON.parse(text) as LlmSemanticResponse;
    } catch (error) {
      throw new Error(
        `Failed to parse Gemini JSON response for card "${input.name}": ${error instanceof Error ? error.message : String(error)}. Raw text: ${text}`,
      );
    }

    const roles = filterValid<CardRole>(parsed.roles, CARD_ROLES_SET, 'role');
    const triggers = filterValid<CardTrigger>(parsed.triggers, CARD_TRIGGERS_SET, 'trigger');
    const outcomes = filterValid<CardOutcome>(parsed.outcomes, CARD_OUTCOMES_SET, 'outcome');
    const costFlags = sanitizeCostFlags(parsed.costFlags);
    const restrictions = sanitizeRestrictions(parsed.restrictions);

    // mentionedCardNames is deliberately dropped here — see interface comment above.
    return { roles, triggers, outcomes, costFlags, restrictions };
  }
}
