import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  ComboEntry,
  ComboLine,
  ComboPartner,
  ComboPartnerRecord,
  ComboResult,
  ComboScriptInfo,
  ComboStep,
} from '../models/card-combo.model';
import {
  CardKnowledgeEntry,
  CardKnowledgeIndex,
  CardKnowledgeRelated,
} from '../models/card-knowledge.model';
import { EffectScript } from '../models/effect-script.model';
import { YgoCard } from '../models/ygo-card.model';
import { BanlistStatus, YgoFormat } from '../models/ygo-format.model';
import { scoreForCompletion } from '../utils/completion-prompt.utils';
import { CardLegalityFacade } from './card-legality.facade';
import { SynergyRetrievalService } from './synergy-retrieval.service';
import { DeckStrategyStore } from '../features/decklist/stores/deck-strategy.store';
import { toDisplayTags } from '../utils/knowledge-display.utils';
import { SYNERGY_REASON_KEYS } from '../utils/knowledge-constants';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { EffectScriptService } from './effect-script.service';

const MAX_STRATEGY_SYNERGIES = 48;

const PARTNER_REASON_KEYS: Record<ComboPartnerRecord['role'], string> = {
  satisfies_requirement: 'combo.reason.satisfiesRequirement',
  puts_on_field: 'combo.reason.putsOnField',
  summon_target: 'combo.reason.summonTarget',
  tribute_fodder: 'combo.reason.tributeFodder',
  summon_support: 'combo.reason.summonSupport',
  enabled_card: 'combo.reason.enabledCard',
};

@Injectable({ providedIn: 'root' })
export class CardComboService {
  private readonly indexService = inject(CardKnowledgeIndexService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly synergyRetrieval = inject(SynergyRetrievalService);
  private readonly strategy = inject(DeckStrategyStore);
  private readonly effectScripts = inject(EffectScriptService);

  findCombos$(card: YgoCard, format: YgoFormat): Observable<ComboResult> {
    return combineLatest([
      this.indexService.combos$,
      this.strategy.ragResult$,
      this.indexService.related$,
      this.effectScripts.ensureLoaded$(),
    ]).pipe(
      switchMap(([index, rag, knowledgeIndex]) => {
        if (!index && !knowledgeIndex) {
          return of(this.attachScript(card, this.emptyResult()));
        }
        const comboEntry = index?.entries[String(card.id)];
        const knowledgeEntry = knowledgeIndex?.entries[String(card.id)];
        if (!comboEntry && !knowledgeEntry) {
          return of(this.attachScript(card, { ...this.emptyResult(), available: true }));
        }
        return this.filterEntry$(
          card,
          comboEntry ?? this.emptyComboEntry(),
          knowledgeEntry,
          knowledgeIndex,
          format,
          rag.profile,
        ).pipe(map((result) => this.attachScript(card, result, knowledgeIndex)));
      }),
    );
  }

  private filterEntry$(
    card: YgoCard,
    entry: ComboEntry,
    knowledgeEntry: CardKnowledgeEntry | undefined,
    knowledgeIndex: CardKnowledgeIndex | null,
    format: YgoFormat,
    profile: Parameters<typeof scoreForCompletion>[2],
  ): Observable<ComboResult> {
    const entries = knowledgeIndex?.entries ?? {};
    const partners = [...entry.enablers, ...entry.targets];
    const comboIds = new Set(partners.map((partner) => partner.id));
    const excludeIds = new Set<number>([card.id, ...comboIds]);

    return this.synergyRetrieval.retrieve$(card.id, profile, excludeIds, { limit: 96 }).pipe(
      switchMap((synergyCandidates) => {
        const allStubs = [
          ...partners.map((partner) => this.toYgoCard(partner)),
          ...synergyCandidates.map((related) => this.relatedToYgoCard(related)),
        ];

        if (allStubs.length === 0) {
          return of(this.toResult(entry, [], [], [], []));
        }

        return this.cardLegality.evaluateMany$(allStubs, format).pipe(
          map((legality) => {
            const playable = new Set(
              [...legality.entries()]
                .filter(([, verdict]) => verdict.verdict === 'legal' || verdict.verdict === 'restricted')
                .map(([id]) => id),
            );

            const enablers = entry.enablers
              .filter((item) => playable.has(item.id))
              .map((item) => this.toPartner(item, entries, profile))
              .sort((a, b) => b.score - a.score);
            const targets = entry.targets
              .filter((item) => playable.has(item.id))
              .map((item) => this.toPartner(item, entries, profile))
              .sort((a, b) => b.score - a.score);
            const playableIds = new Set([...enablers, ...targets].map((item) => item.id));

            const synergies = synergyCandidates
              .filter((item) => playable.has(item.id) && !playableIds.has(item.id))
              .map((item) => this.toSynergyPartner(item, card.name, entries, profile))
              .map((item) => this.boostPartnerFromScript(card.id, item))
              .sort((a, b) => b.score - a.score)
              .slice(0, MAX_STRATEGY_SYNERGIES);

            const lines = entry.lines
              .map((line) => ({
                ...line,
                steps: line.steps.filter(
                  (step) => step.role === 'source' || playableIds.has(step.cardId),
                ),
              }))
              .filter((line) => line.steps.some((step) => step.role === 'target'))
              .sort((a, b) => this.lineScore(b, profile, entries) - this.lineScore(a, profile, entries));

            const result = this.toResult(entry, enablers, targets, synergies, lines.slice(0, 8));
            return result;
          }),
        );
      }),
    );
  }

  private attachScript(
    card: YgoCard,
    result: ComboResult,
    knowledgeIndex: CardKnowledgeIndex | null = null,
  ): ComboResult {
    const script = this.effectScripts.getScript(card.id);
    if (!script) {
      return result;
    }

    const scriptInfo = this.toScriptInfo(script);
    const scriptLines = this.linesFromScript(card, script, knowledgeIndex);
    const mergedLines = [...scriptLines, ...result.lines].slice(0, 8);
    const roleEffects = script.roles.map((role) => ({
      kind: `script_role:${role}`,
      payload: { role },
    }));

    return {
      ...result,
      available: true,
      effects: [...roleEffects, ...result.effects],
      lines: mergedLines.length > 0 ? mergedLines : result.lines,
      script: scriptInfo,
    };
  }

  private toScriptInfo(script: EffectScript): ComboScriptInfo {
    return {
      cardId: script.cardId,
      name: script.name,
      roles: [...script.roles],
      source: script.source,
      confidence: script.confidence,
      luaSource: script.luaSource,
      steps: script.steps.map((step) => ({
        id: step.id,
        when: step.when,
        summary: step.actions
          .map((action) =>
            [action.op, action.filter, action.note].filter(Boolean).join(' · '),
          )
          .join('; '),
      })),
    };
  }

  private linesFromScript(
    card: YgoCard,
    script: EffectScript,
    knowledgeIndex: CardKnowledgeIndex | null,
  ): ComboLine[] {
    if (!knowledgeIndex || script.steps.length === 0) {
      return [];
    }

    const imageSmall =
      card.card_images?.[0]?.image_url_small ??
      `https://images.ygoprodeck.com/images/cards_small/${card.id}.jpg`;

    const lines: ComboLine[] = [];
    for (const step of script.steps) {
      const filters = step.actions
        .map((action) => action.filter)
        .filter((value): value is string => !!value && value.trim().length > 0);
      if (filters.length === 0) {
        continue;
      }

      const partners = this.findScriptPartners(filters, knowledgeIndex, card.id).slice(0, 3);
      if (partners.length === 0) {
        continue;
      }

      const steps: ComboStep[] = [
        {
          role: 'source',
          cardId: card.id,
          name: card.name,
          reasonKey: 'combo.step.source',
          imageSmall,
        },
        ...partners.map((partner) => ({
          role: 'target' as const,
          cardId: partner.id,
          name: partner.name,
          reasonKey: 'combo.reason.scriptTarget',
          reasonParams: { name: partner.name, when: step.when },
          imageSmall: partner.imageSmall,
        })),
      ];

      lines.push({ id: `script:${script.cardId}:${step.id}`, steps });
    }

    return lines;
  }

  private findScriptPartners(
    filters: string[],
    knowledgeIndex: CardKnowledgeIndex,
    sourceId: number,
  ): Array<{ id: number; name: string; imageSmall: string }> {
    const tokens = filters
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);

    if (tokens.length === 0) {
      return [];
    }

    const scored = new Map<number, { id: number; name: string; imageSmall: string; score: number }>();

    const consider = (id: number, name: string, imageSmall: string, base: number) => {
      if (id === sourceId || !name) {
        return;
      }
      const lower = name.toLowerCase();
      let score = base;
      for (const token of tokens) {
        if (lower.includes(token)) {
          score += 2;
        }
      }
      if (score <= base) {
        return;
      }
      const prev = scored.get(id);
      if (!prev || prev.score < score) {
        scored.set(id, { id, name, imageSmall, score });
      }
    };

    const sourceEntry = knowledgeIndex.entries[String(sourceId)];
    for (const related of sourceEntry?.related ?? []) {
      consider(related.id, related.name, related.imageSmall, related.score);
      if (related.archetype) {
        for (const token of tokens) {
          if (related.archetype.toLowerCase().includes(token)) {
            consider(related.id, related.name, related.imageSmall, related.score + 1);
          }
        }
      }
    }

    for (const [archetype, roster] of Object.entries(knowledgeIndex.archetypes ?? {})) {
      const archLower = archetype.toLowerCase();
      if (!tokens.some((token) => archLower.includes(token) || token.includes(archLower))) {
        continue;
      }
      for (const member of roster.slice(0, 24)) {
        consider(
          member.id,
          member.name,
          member.imageSmall,
          1.2,
        );
      }
    }

    for (const [series, roster] of Object.entries(knowledgeIndex.seriesIndex ?? {})) {
      const seriesLower = series.toLowerCase();
      if (!tokens.some((token) => seriesLower.includes(token))) {
        continue;
      }
      for (const member of roster.slice(0, 24)) {
        consider(member.id, member.name, member.imageSmall, 1.1);
      }
    }

    return [...scored.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ id, name, imageSmall }) => ({ id, name, imageSmall }));
  }

  private boostPartnerFromScript(cardId: number, partner: ComboPartner): ComboPartner {
    const script = this.effectScripts.getScript(cardId);
    if (!script) {
      return partner;
    }
    const blob = script.steps
      .flatMap((step) => step.actions.map((action) => `${action.filter ?? ''} ${action.note ?? ''}`))
      .join(' ')
      .toLowerCase();
    const name = partner.name.toLowerCase();
    const hit =
      blob.includes(name) ||
      name.split(/\s+/).some((token) => token.length > 3 && blob.includes(token));
    if (!hit) {
      return partner;
    }
    return {
      ...partner,
      score: partner.score + 0.35,
      reasonKey: partner.reasonKey === 'knowledge.reason.related' ? 'combo.reason.scriptTarget' : partner.reasonKey,
      reasonParams: { ...partner.reasonParams, name: partner.name },
    };
  }

  private toSynergyPartner(
    related: CardKnowledgeRelated,
    sourceName: string,
    entries: Record<string, CardKnowledgeEntry>,
    profile: Parameters<typeof scoreForCompletion>[2],
  ): ComboPartner {
    const reasonKey =
      related.relation === 'mechanic_synergy'
        ? SYNERGY_REASON_KEYS['mechanic_synergy']
        : (SYNERGY_REASON_KEYS[related.relation] ?? 'knowledge.reason.related');

    const suggestion = {
      cardId: related.id,
      name: related.name,
      relation: related.relation,
      score: related.score,
      archetype: related.archetype,
      imageSmall: related.imageSmall,
      reasonKey,
    };
    const strategyScore = scoreForCompletion(suggestion, entries[String(related.id)], profile, 'main');

    return {
      id: related.id,
      name: related.name,
      role: 'summon_support',
      score: strategyScore,
      tcgDate: related.tcgDate,
      banTcg: related.banTcg,
      imageSmall: related.imageSmall,
      reasonKey,
      reasonParams: this.synergyReasonParams(related, sourceName),
    };
  }

  private synergyReasonParams(
    related: CardKnowledgeRelated,
    sourceName: string,
  ): Record<string, string> {
    if (related.relation === 'series' && related.archetype) {
      return { series: related.archetype };
    }
    if (related.relation === 'mentions_card') {
      return { name: sourceName };
    }
    if (related.relation === 'mechanic_synergy' && related.mechanicTrigger) {
      return { trigger: related.mechanicTrigger.replace(/_/g, ' ') };
    }
    if (related.relation === 'matchup') {
      return { matchup: 'meta' };
    }
    return { name: related.name };
  }

  private relatedToYgoCard(related: CardKnowledgeRelated): YgoCard {
    const banTcg = related.banTcg as BanlistStatus | null | undefined;
    return {
      id: related.id,
      name: related.name,
      type: 'Monster',
      desc: '',
      card_images: [
        {
          id: related.id,
          image_url: related.imageSmall.replace('cards_small', 'cards'),
          image_url_small: related.imageSmall,
        },
      ],
      banlist_info: banTcg ? { ban_tcg: banTcg } : undefined,
      misc_info: related.tcgDate ? [{ tcg_date: related.tcgDate }] : undefined,
    };
  }

  private emptyComboEntry(): ComboEntry {
    return {
      requirements: [],
      payoffs: [],
      enablers: [],
      targets: [],
      lines: [],
    };
  }

  private lineScore(
    line: ComboResult['lines'][number],
    profile: Parameters<typeof scoreForCompletion>[2],
    entries: Record<string, import('../models/card-knowledge.model').CardKnowledgeEntry>,
  ): number {
    return line.steps.reduce((sum, step) => {
      if (step.role === 'source') {
        return sum;
      }
      const suggestion = {
        cardId: step.cardId,
        name: step.name,
        relation: 'engine',
        score: 1,
        archetype: null,
        imageSmall: step.imageSmall,
        reasonKey: 'combo.reason.summonTarget',
      };
      return sum + scoreForCompletion(suggestion, entries[String(step.cardId)], profile, 'main');
    }, 0);
  }

  private toResult(
    entry: ComboEntry,
    enablers: ComboPartner[],
    targets: ComboPartner[],
    synergies: ComboPartner[],
    lines: ComboResult['lines'],
  ): ComboResult {
    const tags = entry.tags ?? [];
    const effects = (entry.effects ?? []) as ComboResult['effects'];
    return {
      tags,
      displayTags: toDisplayTags(tags),
      effects,
      requirements: entry.requirements,
      payoffs: entry.payoffs,
      enablers,
      targets,
      synergies,
      lines,
      available: true,
    };
  }

  private toPartner(
    partner: ComboPartnerRecord,
    entries: Record<string, import('../models/card-knowledge.model').CardKnowledgeEntry>,
    profile: Parameters<typeof scoreForCompletion>[2],
  ): ComboPartner {
    const suggestion = {
      cardId: partner.id,
      name: partner.name,
      relation: 'engine',
      score: partner.score,
      archetype: null,
      imageSmall: partner.imageSmall,
      reasonKey: PARTNER_REASON_KEYS[partner.role],
    };
    const strategyScore = scoreForCompletion(suggestion, entries[String(partner.id)], profile, 'main');

    return {
      id: partner.id,
      name: partner.name,
      role: partner.role,
      score: strategyScore,
      tcgDate: partner.tcgDate,
      banTcg: partner.banTcg,
      imageSmall: partner.imageSmall,
      reasonKey: PARTNER_REASON_KEYS[partner.role],
      reasonParams: { name: partner.name },
    };
  }

  private toYgoCard(partner: ComboPartnerRecord): YgoCard {
    const banTcg = partner.banTcg as BanlistStatus | null | undefined;
    return {
      id: partner.id,
      name: partner.name,
      type: 'Monster',
      desc: '',
      card_images: [
        {
          id: partner.id,
          image_url: partner.imageSmall.replace('cards_small', 'cards'),
          image_url_small: partner.imageSmall,
        },
      ],
      banlist_info: banTcg ? { ban_tcg: banTcg } : undefined,
      misc_info: partner.tcgDate ? [{ tcg_date: partner.tcgDate }] : undefined,
    };
  }

  private emptyResult(): ComboResult {
    return {
      tags: [],
      displayTags: [],
      effects: [],
      requirements: [],
      payoffs: [],
      enablers: [],
      targets: [],
      synergies: [],
      lines: [],
      available: false,
    };
  }
}
