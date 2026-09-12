import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ComboEntry } from '../../../models/card-combo.model';
import { EffectAction } from '../../../models/effect-script.model';
import {
  FlowCard,
  CardRoleTag,
  scriptToRoles,
  FlowInterrupt,
  ResolvedDeck,
  WizardAnalysis,
  WizardLineStep,
  scriptToFlowInterrupts,
} from '../../../models/ygo-flow.model';
import { CardKnowledgeIndexService } from '../../../services/card-knowledge-index.service';
import { EffectScriptService } from '../../../services/effect-script.service';
import { I18nService } from '../../../services/i18n.service';
import { hypergeometricAtLeastOne, toPercent } from '../../../utils/hypergeo.utils';

/** Legacy HAT-2014 meta-priority tie-break (Myrmeleo > Sanctum > Duality > Fire/Ice Hand). */
const STARTER_PRIORITY: readonly number[] = [
  91812341, // Traptrix Myrmeleo
  12444060, // Artifact Sanctum
  98645731, // Pot of Duality
  68535320, // Fire Hand
  95929069, // Ice Hand
];

const CURATED_TARGETS_PER_STARTER = 3;

interface ChokepointGroup {
  labelKey: string;
  matcher: (nameLower: string) => boolean;
}

const CHOKEPOINT_GROUPS: readonly ChokepointGroup[] = [
  { labelKey: 'flow.wizard.engine.traptrix', matcher: (n) => n.includes('traptrix') },
  { labelKey: 'flow.wizard.engine.artifact', matcher: (n) => n.includes('artifact') },
  {
    labelKey: 'flow.wizard.engine.hands',
    matcher: (n) => n.includes('fire hand') || n.includes('ice hand'),
  },
];

@Injectable({ providedIn: 'root' })
export class ComboWizardService {
  private readonly effectScripts = inject(EffectScriptService);
  private readonly i18n = inject(I18nService);
  private readonly indexService = inject(CardKnowledgeIndexService);
  private readonly comboIndex = toSignal(this.indexService.combos$, { initialValue: null });

  /** Analyzes a drawn hand: combo line off the highest-priority starter, or brick advice. */
  analyzeHand(
    hand: readonly FlowCard[],
    deck?: Pick<ResolvedDeck, 'main' | 'extra' | 'side'>,
    roles: Record<string, CardRoleTag> = {},
  ): WizardAnalysis {
    const starters = this.rankedStarters(hand, roles);
    if (starters.length === 0) {
      return this.buildBrickAnalysis(hand, roles);
    }
    return this.buildComboAnalysis(hand, starters, deck, roles);
  }

  /** One analysis per unique starter found in the main deck (each treated as the sole opener). */
  analyzeAllStarters(
    deck: Pick<ResolvedDeck, 'main'> & Partial<Pick<ResolvedDeck, 'extra' | 'side'>>,
    roles: Record<string, CardRoleTag> = {},
  ): WizardAnalysis[] {
    const seen = new Set<number>();
    const starters: FlowCard[] = [];
    for (const card of deck.main) {
      if (this.effectiveRole(card, roles) === 'starter' && !seen.has(card.passcode)) {
        seen.add(card.passcode);
        starters.push(card);
      }
    }
    starters.sort((a, b) => this.starterScore(b.passcode) - this.starterScore(a.passcode));
    return starters.map((starter) =>
      this.buildComboAnalysis(
        [starter],
        [starter],
        { main: deck.main, extra: deck.extra ?? [], side: deck.side ?? [] },
        roles,
      ),
    );
  }

  /** Consistency advice for the HAT-2014 chokepoint engines (Traptrix / Artifact / Hands). */
  chokepointsAdvice(deck: Pick<ResolvedDeck, 'main'>): string[] {
    const main = deck.main;
    const total = main.length;
    const advice: string[] = [];
    if (total === 0) {
      return advice;
    }

    for (const group of CHOKEPOINT_GROUPS) {
      const count = main.filter((card) => group.matcher(card.name.toLowerCase())).length;
      if (count === 0) {
        continue;
      }
      const engineName = this.i18n.t(group.labelKey);
      const probability = hypergeometricAtLeastOne(total, count, 5);
      if (count < 3) {
        advice.push(
          this.i18n.t('flow.wizard.advice.thinEngine', {
            engine: engineName,
            count: String(count),
          }),
        );
      }
      advice.push(
        this.i18n.t(
          probability < 0.5 ? 'flow.wizard.advice.lowOpenRate' : 'flow.wizard.advice.goodOpenRate',
          { engine: engineName, pct: toPercent(probability, 0) },
        ),
      );
    }

    const trapCount = main.filter((card) => this.hasRole(card.passcode, 'trap')).length;
    const handtrapCount = main.filter((card) => this.hasRole(card.passcode, 'handtrap')).length;
    if (trapCount + handtrapCount === 0) {
      advice.push(this.i18n.t('flow.wizard.advice.noInteraction'));
    }

    return advice;
  }

  private rankedStarters(
    hand: readonly FlowCard[],
    roles: Record<string, CardRoleTag>,
  ): FlowCard[] {
    return [...hand]
      .filter((card) => this.effectiveRole(card, roles) === 'starter')
      .sort((a, b) => this.starterScore(b.passcode) - this.starterScore(a.passcode));
  }

  /** Real-signal starter quality: script confidence + curated combo richness + step count,
   *  with a small nudge for cards on the legacy HAT-2014 meta-priority list. */
  private starterScore(cardId: number): number {
    const script = this.effectScripts.getScript(cardId);
    const comboEntry = this.comboIndex()?.entries[String(cardId)];
    let score = script?.confidence ?? 0.5;
    score += (script?.steps.length ?? 0) * 0.15;
    if (comboEntry) {
      const topTargetScore = comboEntry.targets
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .reduce((sum, target) => sum + target.score, 0);
      score += topTargetScore * 0.3;
      if (comboEntry.lines.length > 0) {
        score += 0.5;
      }
    }
    const legacyIdx = STARTER_PRIORITY.indexOf(cardId);
    if (legacyIdx !== -1) {
      score += (STARTER_PRIORITY.length - legacyIdx) * 0.2;
    }
    return score;
  }

  /** Curated combo-library targets for a starter, excluding ones already surfaced as
   *  script steps or already sitting in hand. */
  private curatedTargetsFor(
    starter: FlowCard,
    comboEntry: ComboEntry | undefined,
    alreadyMentioned: ReadonlySet<number>,
    hand: readonly FlowCard[],
    deck?: Pick<ResolvedDeck, 'main' | 'extra' | 'side'>,
  ): WizardLineStep | null {
    if (!comboEntry || comboEntry.targets.length === 0) {
      return null;
    }
    const handIds = new Set(hand.map((card) => card.passcode));
    const available = deck ? new Set([...deck.main, ...deck.extra].map((c) => c.passcode)) : null;
    const picks = comboEntry.targets
      .filter(
        (target) =>
          !alreadyMentioned.has(target.id) &&
          !handIds.has(target.id) &&
          (!available || available.has(target.id)),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, CURATED_TARGETS_PER_STARTER);
    if (picks.length === 0) {
      return null;
    }
    return {
      order: 0,
      title: this.i18n.t('flow.wizard.line.curatedTargets', { name: starter.name }),
      detail: picks.map((target) => target.name).join(' · '),
      interruptRisk: [],
    };
  }

  private hasRole(cardId: number, role: string): boolean {
    return this.effectScripts.getScript(cardId)?.roles.includes(role as never) ?? false;
  }

  private effectiveRole(card: FlowCard, roles: Record<string, CardRoleTag>): CardRoleTag {
    return (
      roles[String(card.passcode)] ??
      (card.role !== 'untagged'
        ? card.role
        : scriptToRoles(this.effectScripts.getScript(card.passcode)))
    );
  }

  private buildComboAnalysis(
    hand: readonly FlowCard[],
    starters: readonly FlowCard[],
    deck?: Pick<ResolvedDeck, 'main' | 'extra' | 'side'>,
    roles: Record<string, CardRoleTag> = {},
  ): WizardAnalysis {
    const lines: WizardLineStep[] = [];
    const usedInterrupts = new Set<FlowInterrupt>();
    const mentionedCardIds = new Set<number>(starters.map((s) => s.passcode));
    let order = 1;

    for (const starter of starters.slice(0, 1)) {
      const script = this.effectScripts.getScript(starter.passcode);
      const interrupts = scriptToFlowInterrupts(script);
      interrupts.forEach((tag) => usedInterrupts.add(tag));

      lines.push({
        order: order++,
        title: this.i18n.t('flow.wizard.line.activate', { name: starter.name }),
        detail: this.i18n.t('flow.wizard.line.activateDetail', { name: starter.name }),
        cardId: starter.passcode,
        interruptRisk: interrupts,
      });

      for (const step of script?.steps ?? []) {
        lines.push({
          order: order++,
          title: this.humanizeTrigger(step.when),
          detail: step.actions.map((action) => this.describeAction(action)).join(' · '),
          cardId: starter.passcode,
          interruptRisk: interrupts,
        });
      }

      const comboEntry = this.comboIndex()?.entries[String(starter.passcode)];
      const curated = this.curatedTargetsFor(starter, comboEntry, mentionedCardIds, hand, deck);
      if (curated) {
        curated.order = order++;
        lines.push(curated);
        for (const target of comboEntry?.targets ?? []) {
          mentionedCardIds.add(target.id);
        }
      }
    }

    const starterUids = new Set(starters.map((s) => s.uid));
    const advice: string[] = [this.i18n.t('studio.wizard.candidate')];
    if (starters.length > 1)
      advice.push(
        this.i18n.t('studio.wizard.alternatives', {
          names: starters
            .slice(1)
            .map((c) => c.name)
            .join(', '),
        }),
      );
    const extenders = hand.filter((c) => this.effectiveRole(c, roles) === 'extender');
    if (extenders.length)
      advice.push(
        this.i18n.t('studio.wizard.extenders', { names: extenders.map((c) => c.name).join(', ') }),
      );
    if (usedInterrupts.size > 0) {
      advice.push(
        this.i18n.t('flow.wizard.advice.interruptRisk', {
          names: [...usedInterrupts].map((tag) => this.i18n.t(`flow.interrupt.${tag}`)).join(', '),
        }),
      );
    }

    const traps = hand.filter(
      (card) => !starterUids.has(card.uid) && this.effectiveRole(card, roles) === 'interaction',
    );
    if (traps.length > 0) {
      advice.push(
        this.i18n.t('flow.wizard.advice.backupTraps', {
          names: traps.map((c) => c.name).join(', '),
        }),
      );
    }

    return { kind: 'combo', starters: [...starters], lines, advice };
  }

  private buildBrickAnalysis(
    hand: readonly FlowCard[],
    roles: Record<string, CardRoleTag>,
  ): WizardAnalysis {
    const traps = hand.filter((card) => this.effectiveRole(card, roles) === 'interaction');
    const handtraps = hand.filter((card) => this.effectiveRole(card, roles) === 'handtrap');
    const advice: string[] = [];

    if (traps.length > 0) {
      advice.push(
        this.i18n.t('flow.wizard.advice.brickTraps', {
          names: traps.map((c) => c.name).join(', '),
          count: String(traps.length),
        }),
      );
    }
    if (handtraps.length > 0) {
      advice.push(
        this.i18n.t('flow.wizard.advice.brickHandtraps', {
          names: handtraps.map((c) => c.name).join(', '),
        }),
      );
    }
    if (traps.length === 0 && handtraps.length === 0) {
      advice.push(this.i18n.t('flow.wizard.advice.brickNothing'));
    }

    return {
      kind: traps.length || handtraps.length ? 'control' : 'unclassified',
      starters: [],
      lines: [],
      advice,
    };
  }

  private describeAction(action: EffectAction): string {
    const params = {
      qty: String(action.qty ?? 1),
      filter: action.filter ?? '',
      from: action.from ?? '',
      to: action.to ?? '',
      note: action.note ?? '',
    };
    const key = `flow.wizard.action.${action.op}`;
    const translated = this.i18n.t(key, params);
    return translated === key ? (action.note ?? action.op) : translated;
  }

  private humanizeTrigger(when: string): string {
    return when.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
