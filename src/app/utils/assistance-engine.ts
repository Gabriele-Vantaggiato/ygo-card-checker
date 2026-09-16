import { CardKnowledgeIndex, CardKnowledgeRosterMember } from '../models/card-knowledge.model';
import { EffectAction, EffectScript } from '../models/effect-script.model';
import { AssistanceBoard, AssistanceCandidate, ResourceAdvice, SegocProfile, TriggerOverlap } from '../models/assistance.model';
import { belongsToSetcode, sharesSetcode } from './setcode.utils';
import { buildCardRosterMap } from './synergy-retrieval.utils';

const normalize = (value: string) => value.trim().toLowerCase().replace(/[“”]/g, '"').replace(/\s+/g, ' ');
const TRANSFERS = new Set(['search', 'add', 'ss', 'set']);
type Target = { id: number; evidence: AssistanceCandidate['evidence'] };

/** Per-index caches. No substring name matching, Lua execution or mutable duel state. */
export class AssistanceEngine {
  readonly catalog: Map<number, CardKnowledgeRosterMember>;
  private readonly names = new Map<string, number[]>();
  private readonly series = new Map<string, Set<number>>();
  private readonly targetCache = new Map<string, Target[] | null>();
  private readonly familyIndex = new Map<number, Set<number>>();
  private readonly familyCache = new Map<number, number[]>();

  constructor(readonly index: CardKnowledgeIndex) {
    this.catalog = buildCardRosterMap(index);
    for (const [id, member] of this.catalog) {
      for (const code of index.entries[String(id)]?.setcodes ?? []) {
        const bucket = this.familyIndex.get(code & 0xfff) ?? new Set<number>();
        bucket.add(id); this.familyIndex.set(code & 0xfff, bucket);
      }
      const name = normalize(member.name);
      this.names.set(name, [...(this.names.get(name) ?? []), id]);
      for (const label of index.entries[String(id)]?.series ?? []) {
        const bucket = this.series.get(normalize(label)) ?? new Set<number>();
        bucket.add(id);
        this.series.set(normalize(label), bucket);
      }
    }
  }

  /** Null: unknown grammar. Empty: understood but no matching cards. */
  targets(filter: string, sourceId: number): Target[] | null {
    const text = normalize(filter);
    const cacheKey = text.includes('this card') ? `${sourceId}:${text}` : text;
    if (this.targetCache.has(cacheKey)) return this.targetCache.get(cacheKey)!;
    const results = text.split(/\s*\|\s*/).map(clause => this.matchClause(clause, sourceId));
    const found = results.some(result => result === null) ? null :
      [...new Map(results.flatMap(result => result ?? []).map(hit => [hit.id, hit])).values()];
    this.targetCache.set(cacheKey, found);
    return found;
  }

  private matchClause(text: string, sourceId: number): Target[] | null {
    if (text === 'this card') return [{ id: sourceId, evidence: 'exact_name' }];
    const bare = text.replace(/^"(.+)"$/, '$1');
    const named = this.names.get(bare);
    if (named) return named.map(id => ({ id, evidence: 'exact_name' }));
    const code = /^setcode:(0x[0-9a-f]+|\d+)$/.exec(text);
    if (code) return [...this.catalog.keys()]
      .filter(id => belongsToSetcode(this.index.entries[String(id)]?.setcodes ?? [], Number(code[1])))
      .map(id => ({ id, evidence: 'setcode' }));
    const family = this.series.get(bare);
    if (family) return [...family].map(id => ({ id, evidence: 'series' }));
    // Additional adjectives/conditions are deliberately not swallowed.
    const pattern = /^(?:(light|dark|earth|water|fire|wind|divine) )?(?:(zombie|dragon|warrior|spellcaster|machine|fiend|fairy|insect|plant|beast-warrior|beast|dinosaur|wyrm|cyberse|psychic|rock|aqua|thunder|pyro|sea serpent|winged beast|reptile|divine-beast|fish|illusion) )?(monster|spell|trap|card)(?: in (?:gy|graveyard|deck|hand))?$/;
    const match = pattern.exec(text);
    if (!match) return null;
    const [, attribute, race, type] = match;
    return [...this.catalog.values()].filter(member =>
      (type === 'card' || member.type.toLowerCase().includes(type)) &&
      (!race || normalize(member.race ?? '') === race) &&
      (!attribute || normalize(member.attribute ?? '') === attribute),
    ).map(member => ({ id: member.id, evidence: 'structured_filter' }));
  }

  actionTargets(action: EffectAction, sourceId: number): Target[] | null {
    const targets = action.filter ? this.targets(action.filter, sourceId) : null;
    if (!targets) return null;
    const c = action.constraints;
    return targets.filter(hit => {
      const entry = this.index.entries[String(hit.id)];
      const member = this.catalog.get(hit.id);
      if (c?.nameContains && !normalize(member?.name ?? '').includes(normalize(c.nameContains))) return false;
      if (c?.race && normalize(member?.race ?? '') !== normalize(c.race)) return false;
      if (c?.cardType && !normalize(member?.type ?? '').includes(normalize(c.cardType))) return false;
      if (action.from === 'deck' && entry?.isExtraDeck) return false;
      if (c?.excludeSource && hit.id === sourceId) return false;
      if (c?.minLevel !== undefined && (entry?.level == null || entry.level < c.minLevel)) return false;
      if (c?.maxLevel !== undefined && (entry?.level == null || entry.level > c.maxLevel)) return false;
      if (c?.minAtk !== undefined && (entry?.atk == null || entry.atk < c.minAtk)) return false;
      if (c?.maxAtk !== undefined && (entry?.atk == null || entry.atk > c.maxAtk)) return false;
      return true;
    });
  }

  candidates(sourceId: number, script: EffectScript | undefined): AssistanceCandidate[] {
    if (!script) return [];
    const candidates: AssistanceCandidate[] = [];
    for (const step of script.steps) for (const action of step.actions) {
      // Broad zone filters are useful against a concrete board, but not evidence that
      // every monster in the catalog is a meaningful deck/combo recommendation.
      if (!action.constraints && /^(monster|card)( in (gy|graveyard|deck|hand))?$/.test(normalize(action.filter ?? ''))) continue;
      if (!TRANSFERS.has(action.op) || !action.filter) continue;
      for (const match of this.actionTargets(action, sourceId) ?? []) {
        if (match.id === sourceId) continue;
        if (action.from === 'deck' && this.index.entries[String(match.id)]?.isExtraDeck) continue;
        candidates.push({ sourceId, targetId: match.id, stepId: step.id, action,
          evidence: match.evidence,
          score: (match.evidence === 'exact_name' ? 3 : match.evidence === 'setcode' ? 2.8 : match.evidence === 'series' ? 1.8 : 1.4) * Math.min(1, Math.max(0, script.confidence)),
        });
      }
    }
    return candidates.sort((a, b) => b.score - a.score || a.targetId - b.targetId);
  }

  familyPartners(sourceId: number): number[] {
    if (this.familyCache.has(sourceId)) return this.familyCache.get(sourceId)!;
    const codes = this.index.entries[String(sourceId)]?.setcodes ?? [];
    const pool = new Set(codes.flatMap(code => [...(this.familyIndex.get(code & 0xfff) ?? [])]));
    const partners = codes.length ? [...pool].filter(id => id !== sourceId &&
      sharesSetcode(codes, this.index.entries[String(id)]?.setcodes ?? [])) : [];
    this.familyCache.set(sourceId, partners);
    return partners;
  }

  assessResources(sourceId: number, script: EffectScript, board: AssistanceBoard): ResourceAdvice[] {
    const sourcePresent = [...board.hand, ...board.monsters, ...board.spellTraps, ...board.gy, ...board.banish].includes(sourceId);
    if (!sourcePresent) return [];
    return script.steps.filter(step => step.actions.some(action => TRANSFERS.has(action.op))).map(step => {
      const checks = new Set<string>(['activation_conditions']);
      if (step.cost?.length || step.actions.some(action => action.note)) checks.add('costs_and_restrictions');
      if (step.actions.some(action => action.op === 'ss')) checks.add('summon_restrictions');
      if (!['activate', 'ignition', 'gy'].includes(step.when)) checks.add('trigger_timing');
      const targetIds = new Set<number>();
      let missing = false;
      let unknown = step.actions.filter(action => TRANSFERS.has(action.op)).length > 1;
      if (unknown) checks.add('intermediate_state');
      if (step.when === 'gy' && !board.gy.includes(sourceId)) {
        missing = true; checks.add('source_zone');
      }
      if (step.when === 'ignition' && !board.monsters.includes(sourceId) && !board.spellTraps.includes(sourceId)) {
        checks.add('source_zone'); unknown = true;
      }
      for (const action of step.actions) {
        if (!TRANSFERS.has(action.op)) { unknown = true; continue; }
        const matches = this.actionTargets(action, sourceId);
        const pool = action.from === 'hand_or_deck' ? [...board.hand, ...board.deck] :
          action.from === 'deck' ? board.deck : action.from === 'hand' ? board.hand :
          action.from === 'gy' ? board.gy : action.from === 'extra' ? board.extra :
          action.from === 'banish' ? board.banish : null;
        if (!matches || !pool || !Number.isInteger(action.qty ?? 1) || (action.qty ?? 1) < 1) {
          unknown = true; checks.add('target_filter'); continue;
        }
        const allowed = new Set(matches.map(match => match.id));
        const present = pool.filter(id => allowed.has(id));
        present.forEach(id => targetIds.add(id));
        if (present.length < (action.qty ?? 1)) missing = true;
      }
      return { sourceId, stepId: step.id, targetIds: [...targetIds],
        status: unknown ? 'unknown' : missing ? 'missing_resources' : 'resources_present', checks: [...checks],
      };
    });
  }
}

/** Deck-composition signal, never a claim about simultaneous events in a duel. */
export function triggerOverlaps(ids: readonly number[], profiles: Record<string, SegocProfile>): TriggerOverlap[] {
  const groups = new Map<string, Set<number>>();
  for (const id of new Set(ids)) {
    const profile = profiles[String(id)];
    if (profile?.effectType !== 'trigger') continue;
    for (const event of profile.triggerEvents) {
      if (event === 'other') continue;
      const group = groups.get(event) ?? new Set<number>();
      group.add(id); groups.set(event, group);
    }
  }
  return [...groups].filter(([, cards]) => cards.size > 1)
    .map(([event, cards]) => ({ event, cardIds: [...cards].sort((a, b) => a - b), potential: true }));
}
