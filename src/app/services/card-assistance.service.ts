import { isPlayableInFormat, maxCopiesInFormat } from '../utils/format-legality.utils';
import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { EffectScriptService } from './effect-script.service';
import { I18nService } from './i18n.service';
import { AssistanceBoard } from '../models/assistance.model';
import { triggerOverlaps } from '../utils/assistance-engine';

export interface AssistanceReport {
  ready: boolean;
  messages: string[];
  coverage: string;
}

@Injectable({ providedIn: 'root' })
export class CardAssistanceService {
  private readonly indexes = inject(CardKnowledgeIndexService);
  private readonly scripts = inject(EffectScriptService);
  private readonly i18n = inject(I18nService);
  private readonly data = toSignal(combineLatest([
    this.indexes.related$, this.indexes.segoc$, this.indexes.formatLegality$, this.scripts.ensureStudyLoaded$(),
  ]));
  readonly loaded = computed(() => !!this.data());

  analyze(board: AssistanceBoard, formatId: string): AssistanceReport {
    const data = this.data();
    if (!data?.[0]) return { ready: false, messages: [], coverage: this.i18n.t(data ? 'assist.dataMissing' : 'assist.loading') };
    const [index, profiles, legality, scripts] = data;
    const engine = this.indexes.engineFor(index);
    const active = [...new Set([...board.hand, ...board.monsters, ...board.spellTraps, ...board.gy, ...board.banish])];
    const allowed = legality?.formats.includes(formatId) ? (id: number) => isPlayableInFormat(legality, id, formatId) : null;
    const messages: string[] = [];
    if (!allowed) messages.push(this.i18n.t('assist.formatUnknown'));
    const filter = (ids: readonly number[]) => ids.filter(id => allowed?.(id) ?? true);
    const compatibleBoard: AssistanceBoard = {
      hand: filter(board.hand), deck: filter(board.deck), extra: filter(board.extra),
      monsters: filter(board.monsters), spellTraps: filter(board.spellTraps), gy: filter(board.gy), banish: filter(board.banish),
    };
    for (const id of active) {
      const name = engine.catalog.get(id)?.name ?? String(id);
      if (allowed && !allowed(id)) { messages.push(this.i18n.t('assist.notPlayable', { name })); continue; }
      const script = scripts.scripts[String(id)];
      if (!script) continue;
      for (const advice of engine.assessResources(id, script, compatibleBoard)) {
        const targets = advice.targetIds.map(target => engine.catalog.get(target)?.name ?? String(target)).slice(0, 5).join(', ');
        const step = script.steps.find(step => step.id === advice.stepId);
        const detail = step?.actions.map(action => action.filter || action.op).join(' / ') ?? advice.stepId;
        messages.push(this.i18n.t(`assist.${advice.status}`, { name, targets, detail }));
        if (advice.checks.includes('costs_and_restrictions')) messages.push(this.i18n.t('assist.checkCost', { name }));
      }
    }
    // Both cards existing in the deck/board is only a preparation hint, not an event log.
    messages.push(...this.timingMessages(active, profiles ?? {}, id => engine.catalog.get(id)?.name ?? String(id)));
    return { ready: true, messages: [...new Set(messages)].slice(0, 30), coverage: this.coverage(active, scripts.scripts) };
  }

  prepare(ids: readonly number[], formatId: string): AssistanceReport {
    const data = this.data();
    if (!data?.[0]) return { ready: false, messages: [], coverage: this.i18n.t(data ? 'assist.dataMissing' : 'assist.loading') };
    const [index, profiles, legality, scripts] = data;
    const engine = this.indexes.engineFor(index);
    const unique = [...new Set(ids)];
    const counts = new Map<number, number>();
    ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
    const legal = legality?.formats.includes(formatId);
    const messages: string[] = [];
    if (!legal) messages.push(this.i18n.t('assist.formatUnknown'));
    const allowed = legal && legality ? (id: number) => isPlayableInFormat(legality, id, formatId) : null;
    let pairs = 0;
    for (const id of unique) {
      const name = engine.catalog.get(id)?.name ?? String(id);
      if (allowed && !allowed(id)) { messages.push(this.i18n.t('assist.notPlayable', { name })); continue; }
      const max = legality && legal ? maxCopiesInFormat(legality, id, formatId) : null;
      if (max != null && (counts.get(id) ?? 0) > max) messages.push(this.i18n.t('assist.tooMany', { name, max: String(max) }));
      const candidates = engine.candidates(id, scripts.scripts[String(id)]);
      const partners = new Set(candidates.filter(hit => counts.has(hit.targetId) && (!allowed || allowed(hit.targetId))).map(hit => hit.targetId));
      pairs += partners.size;
      if (candidates.length && !partners.size) messages.push(this.i18n.t('assist.noDeckTarget', { name }));
    }
    messages.unshift(this.i18n.t('assist.pairs', { count: String(pairs) }));
    messages.push(...this.timingMessages(unique, profiles ?? {}, id => engine.catalog.get(id)?.name ?? String(id)));
    if (!profiles) messages.push(this.i18n.t('assist.timingMissing'));
    return { ready: true, messages: [...new Set(messages)].slice(0, 30), coverage: this.coverage(unique, scripts.scripts) };
  }

  private coverage(ids: readonly number[], scripts: import('../models/effect-script.model').EffectScriptIndex['scripts']): string {
    return this.i18n.t('assist.coverage', {
      parsed: String(ids.filter(id => scripts[String(id)]?.steps.length).length), total: String(ids.length),
    });
  }

  private timingMessages(ids: readonly number[], profiles: import('../models/assistance.model').SegocIndex['profiles'], name: (id: number) => string): string[] {
    const messages = triggerOverlaps(ids, profiles).map(group => this.i18n.t('assist.triggerOverlap', {
      names: group.cardIds.map(name).join(', '), event: this.i18n.t(`assist.event.${group.event}`),
    }));
    for (const id of new Set(ids)) if (profiles[String(id)]?.missedTimingRisk) messages.push(this.i18n.t('assist.timingRisk', { name: name(id) }));
    return messages;
  }
}
