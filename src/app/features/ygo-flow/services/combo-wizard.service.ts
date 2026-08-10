import { Injectable, inject } from '@angular/core';
import { EffectAction } from '../../../models/effect-script.model';
import {
  FlowCard,
  FlowInterrupt,
  ResolvedDeck,
  WizardAnalysis,
  WizardLineStep,
  scriptToFlowInterrupts,
} from '../../../models/ygo-flow.model';
import { EffectScriptService } from '../../../services/effect-script.service';
import { I18nService } from '../../../services/i18n.service';
import { hypergeometricAtLeastOne, toPercent } from '../../../utils/hypergeo.utils';

/** Turn-1 starter priority for HAT-2014: Myrmeleo > Sanctum > Duality > Fire/Ice Hand. */
const STARTER_PRIORITY: readonly number[] = [
  91812341, // Traptrix Myrmeleo
  12444060, // Artifact Sanctum
  98645731, // Pot of Duality
  68535320, // Fire Hand
  95929069, // Ice Hand
];

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

  /** Analyzes a drawn hand: combo line off the highest-priority starter, or brick advice. */
  analyzeHand(hand: readonly FlowCard[]): WizardAnalysis {
    const starters = this.rankedStarters(hand);
    if (starters.length === 0) {
      return this.buildBrickAnalysis(hand);
    }
    return this.buildComboAnalysis(hand, starters);
  }

  /** One analysis per unique starter found in the main deck (each treated as the sole opener). */
  analyzeAllStarters(deck: Pick<ResolvedDeck, 'main'>): WizardAnalysis[] {
    const seen = new Set<number>();
    const starters: FlowCard[] = [];
    for (const card of deck.main) {
      if (this.effectScripts.isStarter(card.passcode) && !seen.has(card.passcode)) {
        seen.add(card.passcode);
        starters.push(card);
      }
    }
    starters.sort((a, b) => this.starterRank(a.passcode) - this.starterRank(b.passcode));
    return starters.map((starter) => this.buildComboAnalysis([starter], [starter]));
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
          this.i18n.t('flow.wizard.advice.thinEngine', { engine: engineName, count: String(count) }),
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

  private rankedStarters(hand: readonly FlowCard[]): FlowCard[] {
    return [...hand]
      .filter((card) => this.effectScripts.isStarter(card.passcode))
      .sort((a, b) => this.starterRank(a.passcode) - this.starterRank(b.passcode));
  }

  private starterRank(cardId: number): number {
    const idx = STARTER_PRIORITY.indexOf(cardId);
    return idx === -1 ? STARTER_PRIORITY.length : idx;
  }

  private hasRole(cardId: number, role: string): boolean {
    return this.effectScripts.getScript(cardId)?.roles.includes(role as never) ?? false;
  }

  private buildComboAnalysis(hand: readonly FlowCard[], starters: readonly FlowCard[]): WizardAnalysis {
    const lines: WizardLineStep[] = [];
    const usedInterrupts = new Set<FlowInterrupt>();
    let order = 1;

    for (const starter of starters) {
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
    }

    const starterUids = new Set(starters.map((s) => s.uid));
    for (const card of hand) {
      if (starterUids.has(card.uid)) {
        continue;
      }
      const script = this.effectScripts.getScript(card.passcode);
      if (!script || !script.roles.includes('extender')) {
        continue;
      }
      const interrupts = scriptToFlowInterrupts(script);
      interrupts.forEach((tag) => usedInterrupts.add(tag));
      const detail = script.steps
        .map((step) => step.actions.map((action) => this.describeAction(action)).join(' · '))
        .join(' → ');
      lines.push({
        order: order++,
        title: this.i18n.t('flow.wizard.line.extend', { name: card.name }),
        detail: detail || this.i18n.t('flow.wizard.line.extendDetail', { name: card.name }),
        cardId: card.passcode,
        interruptRisk: interrupts,
      });
    }

    const advice: string[] = [];
    if (usedInterrupts.size > 0) {
      advice.push(
        this.i18n.t('flow.wizard.advice.interruptRisk', {
          names: [...usedInterrupts].map((tag) => this.i18n.t(`flow.interrupt.${tag}`)).join(', '),
        }),
      );
    }

    const traps = hand.filter((card) => !starterUids.has(card.uid) && this.hasRole(card.passcode, 'trap'));
    if (traps.length > 0) {
      advice.push(
        this.i18n.t('flow.wizard.advice.backupTraps', { names: traps.map((c) => c.name).join(', ') }),
      );
    }

    return { kind: 'combo', starters: [...starters], lines, advice };
  }

  private buildBrickAnalysis(hand: readonly FlowCard[]): WizardAnalysis {
    const traps = hand.filter((card) => this.hasRole(card.passcode, 'trap'));
    const handtraps = hand.filter((card) => this.hasRole(card.passcode, 'handtrap'));
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

    return { kind: 'brick', starters: [], lines: [], advice };
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
    return translated === key ? action.note ?? action.op : translated;
  }

  private humanizeTrigger(when: string): string {
    return when.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
