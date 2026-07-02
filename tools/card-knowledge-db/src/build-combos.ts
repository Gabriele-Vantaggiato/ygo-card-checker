import {
  cardMatchesNames,
  mentionsCardName,
  seriesNamesForCard,
  type ComboPayoffParsed,
  type ControlRequirement,
  type SelfSummonHandTributePayoff,
  type SpecialSummonFromDeckPayoff,
  type StructuredEffect,
  type TributeSpecialSummonPayoff,
} from './effect-parser';
import { loadEffectsByCard, openDatabase, readMeta, REPO_ROOT } from './database';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EXPORT_PATH = join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge', 'combos.json');
const MAX_ENABLERS = 12;
const MAX_TARGETS = 12;
const MAX_LINES = 8;

interface CardRow {
  id: number;
  name: string;
  type: string;
  level: number | null;
  atk: number | null;
  archetype: string | null;
  desc_en: string;
  tcg_date: string | null;
  ban_tcg: string | null;
}

type PartnerRole =
  | 'satisfies_requirement'
  | 'puts_on_field'
  | 'summon_target'
  | 'tribute_fodder'
  | 'summon_support'
  | 'enabled_card';

interface ComboPartnerExport {
  id: number;
  name: string;
  role: PartnerRole;
  score: number;
  tcgDate: string | null;
  banTcg: string | null;
  imageSmall: string;
}

interface ComboStep {
  role: 'enabler' | 'source' | 'target';
  cardId: number;
  name: string;
  reasonKey: string;
  reasonParams?: Record<string, string>;
  imageSmall: string;
}

interface ComboLine {
  id: string;
  steps: ComboStep[];
}

interface ComboEntry {
  tags: string[];
  effects: Array<{ kind: string; payload: Record<string, unknown> }>;
  requirements: ControlRequirement[];
  payoffs: ComboPayoffParsed[];
  enablers: ComboPartnerExport[];
  targets: ComboPartnerExport[];
  lines: ComboLine[];
}

interface ComboExport {
  version: number;
  generatedAt: string;
  cardCount: number;
  entries: Record<string, ComboEntry>;
}

function isMonster(type: string): boolean {
  return type.includes('Monster');
}

function meetsLevel(level: number | null, minLevel: number): boolean {
  return (level ?? 0) >= minLevel;
}

function meetsAtk(atk: number | null, minAtk: number): boolean {
  return (atk ?? 0) >= minAtk;
}

function loadTagsByCard(db: import('node:sqlite').DatabaseSync): Map<number, Set<string>> {
  const rows = db.prepare('SELECT card_id, tag FROM card_tags').all() as Array<{
    card_id: number;
    tag: string;
  }>;
  const map = new Map<number, Set<string>>();
  for (const row of rows) {
    const bucket = map.get(row.card_id) ?? new Set<string>();
    bucket.add(row.tag);
    map.set(row.card_id, bucket);
  }
  return map;
}

function cardHasTag(tagsByCard: Map<number, Set<string>>, cardId: number, tag: string): boolean {
  return tagsByCard.get(cardId)?.has(tag) ?? false;
}

function cardHasSummonTag(tagsByCard: Map<number, Set<string>>, cardId: number): boolean {
  return (
    cardHasTag(tagsByCard, cardId, 'ss_from_hand') ||
    cardHasTag(tagsByCard, cardId, 'ss_from_deck') ||
    cardHasTag(tagsByCard, cardId, 'ss_from_gy') ||
    cardHasTag(tagsByCard, cardId, 'ss_from_extra') ||
    cardHasTag(tagsByCard, cardId, 'special_summons')
  );
}

function cardHasSearchTag(tagsByCard: Map<number, Set<string>>, cardId: number): boolean {
  return (
    cardHasTag(tagsByCard, cardId, 'searches_monster') ||
    cardHasTag(tagsByCard, cardId, 'searches_spell') ||
    cardHasTag(tagsByCard, cardId, 'searches_deck')
  );
}

function toParsedEffects(effects: StructuredEffect[]): {
  requirements: ControlRequirement[];
  payoffs: ComboPayoffParsed[];
} {
  return {
    requirements: effects.filter((e): e is ControlRequirement => e.kind === 'control'),
    payoffs: effects.filter((e): e is ComboPayoffParsed => e.kind !== 'control'),
  };
}

function toImage(cardId: number): string {
  return `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg`;
}

function findEnablersForControl(
  tagsByCard: Map<number, Set<string>>,
  cards: CardRow[],
  requirement: ControlRequirement,
  sourceId: number,
): ComboPartnerExport[] {
  const partners = new Map<number, ComboPartnerExport>();

  for (const card of cards) {
    if (card.id === sourceId || !isMonster(card.type)) {
      continue;
    }
    if (!meetsLevel(card.level, requirement.minLevel)) {
      continue;
    }
    if (
      !cardMatchesNames({
        name: card.name,
        archetype: card.archetype,
        desc: card.desc_en,
        names: requirement.names,
      })
    ) {
      continue;
    }

    partners.set(card.id, {
      id: card.id,
      name: card.name,
      role: 'satisfies_requirement',
      score: 1.2 + (card.archetype && requirement.names.includes(card.archetype) ? 0.3 : 0),
      tcgDate: card.tcg_date,
      banTcg: card.ban_tcg,
      imageSmall: toImage(card.id),
    });
  }

  for (const card of cards) {
    if (card.id === sourceId || partners.has(card.id)) {
      continue;
    }
    const summons = cardHasSummonTag(tagsByCard, card.id);
    const searches = cardHasSearchTag(tagsByCard, card.id);
    if (!summons && !searches) {
      continue;
    }
    if (
      !cardMatchesNames({
        name: card.name,
        archetype: card.archetype,
        desc: card.desc_en,
        names: requirement.names,
      })
    ) {
      continue;
    }

    partners.set(card.id, {
      id: card.id,
      name: card.name,
      role: 'puts_on_field',
      score: searches && summons ? 1.1 : searches ? 1.0 : 0.85,
      tcgDate: card.tcg_date,
      banTcg: card.ban_tcg,
      imageSmall: toImage(card.id),
    });
  }

  return [...partners.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_ENABLERS);
}

function findTributeFodderByNames(
  cards: CardRow[],
  payoff: TributeSpecialSummonPayoff,
  sourceId: number,
): ComboPartnerExport[] {
  return cards
    .filter(
      (card) =>
        card.id !== sourceId &&
        isMonster(card.type) &&
        cardMatchesNames({
          name: card.name,
          archetype: card.archetype,
          desc: card.desc_en,
          names: payoff.tributeNames,
        }),
    )
    .map((card) => ({
      id: card.id,
      name: card.name,
      role: 'tribute_fodder' as const,
      score: 1.3,
      tcgDate: card.tcg_date,
      banTcg: card.ban_tcg,
      imageSmall: toImage(card.id),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_ENABLERS);
}

function findSummonTargetsByNames(
  cards: CardRow[],
  names: string[],
  sourceId: number,
): ComboPartnerExport[] {
  return cards
    .filter(
      (card) =>
        card.id !== sourceId &&
        isMonster(card.type) &&
        cardMatchesNames({
          name: card.name,
          archetype: card.archetype,
          desc: card.desc_en,
          names,
        }),
    )
    .map((card) => ({
      id: card.id,
      name: card.name,
      role: 'summon_target' as const,
      score: 1.35,
      tcgDate: card.tcg_date,
      banTcg: card.ban_tcg,
      imageSmall: toImage(card.id),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_TARGETS);
}

function findTributeFodder(
  cards: CardRow[],
  payoff: SelfSummonHandTributePayoff,
  sourceId: number,
): ComboPartnerExport[] {
  return cards
    .filter(
      (card) =>
        card.id !== sourceId &&
        isMonster(card.type) &&
        meetsAtk(card.atk, payoff.minAtk),
    )
    .map((card) => ({
      id: card.id,
      name: card.name,
      role: 'tribute_fodder' as const,
      score: 1 + Math.min((card.atk ?? 0) / 10000, 0.2),
      tcgDate: card.tcg_date,
      banTcg: card.ban_tcg,
      imageSmall: toImage(card.id),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_ENABLERS);
}

function findSummonSupport(
  tagsByCard: Map<number, Set<string>>,
  cards: CardRow[],
  source: CardRow,
): ComboPartnerExport[] {
  const series = seriesNamesForCard(source);
  return cards
    .filter((card) => {
      if (card.id === source.id) {
        return false;
      }
      const summons = cardHasSummonTag(tagsByCard, card.id);
      const searches = cardHasSearchTag(tagsByCard, card.id);
      if (!summons && !searches) {
        return false;
      }
      return (
        mentionsCardName(card.desc_en, source.name) ||
        cardMatchesNames({
          name: card.name,
          archetype: card.archetype,
          desc: card.desc_en,
          names: series,
        })
      );
    })
    .map((card) => ({
      id: card.id,
      name: card.name,
      role: 'summon_support' as const,
      score: mentionsCardName(card.desc_en, source.name) ? 1.25 : 1.0,
      tcgDate: card.tcg_date,
      banTcg: card.ban_tcg,
      imageSmall: toImage(card.id),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_ENABLERS);
}

function findDeckTargets(
  cards: CardRow[],
  payoff: SpecialSummonFromDeckPayoff,
  sourceId: number,
): ComboPartnerExport[] {
  return cards
    .filter(
      (card) =>
        card.id !== sourceId &&
        isMonster(card.type) &&
        meetsLevel(card.level, payoff.minLevel) &&
        cardMatchesNames({
          name: card.name,
          archetype: card.archetype,
          desc: card.desc_en,
          names: payoff.names,
        }),
    )
    .map((card) => ({
      id: card.id,
      name: card.name,
      role: 'summon_target' as const,
      score: 1 + (card.archetype && payoff.names.includes(card.archetype) ? 0.25 : 0),
      tcgDate: card.tcg_date,
      banTcg: card.ban_tcg,
      imageSmall: toImage(card.id),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_TARGETS);
}

function findEnabledCards(
  cardsWithRequirements: Array<{ card: CardRow; requirement: ControlRequirement }>,
  source: CardRow,
): ComboPartnerExport[] {
  if (!isMonster(source.type)) {
    return [];
  }

  const enabled: ComboPartnerExport[] = [];
  for (const { card, requirement } of cardsWithRequirements) {
    if (card.id === source.id) {
      continue;
    }
    if (!meetsLevel(source.level, requirement.minLevel)) {
      continue;
    }
    if (
      !cardMatchesNames({
        name: source.name,
        archetype: source.archetype,
        desc: source.desc_en,
        names: requirement.names,
      })
    ) {
      continue;
    }

    enabled.push({
      id: card.id,
      name: card.name,
      role: 'enabled_card',
      score: 1.15,
      tcgDate: card.tcg_date,
      banTcg: card.ban_tcg,
      imageSmall: toImage(card.id),
    });
  }

  return enabled
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_TARGETS);
}

function mergePartners(max: number, ...groups: ComboPartnerExport[][]): ComboPartnerExport[] {
  const map = new Map<number, ComboPartnerExport>();
  for (const group of groups) {
    for (const partner of group) {
      const existing = map.get(partner.id);
      if (!existing || partner.score > existing.score) {
        map.set(partner.id, partner);
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, max);
}

function buildLines(
  source: CardRow,
  enablers: ComboPartnerExport[],
  targets: ComboPartnerExport[],
  enabledCards: ComboPartnerExport[],
  cards: CardRow[],
  effectsByCard: Map<number, StructuredEffect[]>,
): ComboLine[] {
  const lines: ComboLine[] = [];
  const sourceStep: ComboStep = {
    role: 'source',
    cardId: source.id,
    name: source.name,
    reasonKey: 'combo.step.source',
    imageSmall: toImage(source.id),
  };

  const topEnablers = enablers.slice(0, 4);
  const deckTargets = targets.filter((t) => t.role === 'summon_target').slice(0, 4);
  const enabled = enabledCards.slice(0, 4);

  for (const enabler of topEnablers) {
    if (lines.length >= MAX_LINES) {
      break;
    }
    const reasonKey =
      enabler.role === 'tribute_fodder'
        ? 'combo.step.tributeFodder'
        : enabler.role === 'summon_support'
          ? 'combo.step.summonSupport'
          : enabler.role === 'satisfies_requirement'
            ? 'combo.step.enablerRequirement'
            : 'combo.step.enablerSetup';
    lines.push({
      id: `${enabler.id}-${source.id}-summon`,
      steps: [
        {
          role: 'enabler',
          cardId: enabler.id,
          name: enabler.name,
          reasonKey,
          reasonParams: { name: enabler.name },
          imageSmall: enabler.imageSmall,
        },
        { ...sourceStep, reasonKey: 'combo.step.selfSummon' },
      ],
    });
  }

  for (const card of enabled) {
    if (lines.length >= MAX_LINES) {
      break;
    }
    const enabledCard = cards.find((c) => c.id === card.id);
    const payoff = enabledCard
      ? toParsedEffects(effectsByCard.get(card.id) ?? []).payoffs.find((p) => p.kind === 'special_summon_deck')
      : undefined;
    const summonTarget =
      payoff?.kind === 'special_summon_deck'
        ? findDeckTargets(cards, payoff, card.id)[0]
        : undefined;

    if (summonTarget) {
      lines.push({
        id: `${source.id}-${card.id}-${summonTarget.id}`,
        steps: [
          sourceStep,
          {
            role: 'enabler',
            cardId: card.id,
            name: card.name,
            reasonKey: 'combo.step.enabledCard',
            reasonParams: { name: card.name },
            imageSmall: card.imageSmall,
          },
          {
            role: 'target',
            cardId: summonTarget.id,
            name: summonTarget.name,
            reasonKey: 'combo.step.target',
            reasonParams: { name: summonTarget.name },
            imageSmall: summonTarget.imageSmall,
          },
        ],
      });
    } else {
      lines.push({
        id: `${source.id}-${card.id}`,
        steps: [
          sourceStep,
          {
            role: 'target',
            cardId: card.id,
            name: card.name,
            reasonKey: 'combo.step.enabledCard',
            reasonParams: { name: card.name },
            imageSmall: card.imageSmall,
          },
        ],
      });
    }
  }

  for (const enabler of topEnablers) {
    for (const target of deckTargets) {
      if (lines.length >= MAX_LINES) {
        return lines;
      }
      lines.push({
        id: `${enabler.id}-${source.id}-${target.id}-deck`,
        steps: [
          {
            role: 'enabler',
            cardId: enabler.id,
            name: enabler.name,
            reasonKey: 'combo.step.enablerSetup',
            reasonParams: { name: enabler.name },
            imageSmall: enabler.imageSmall,
          },
          sourceStep,
          {
            role: 'target',
            cardId: target.id,
            name: target.name,
            reasonKey: 'combo.step.target',
            reasonParams: { name: target.name },
            imageSmall: target.imageSmall,
          },
        ],
      });
    }
  }

  return lines;
}

function buildEntryForCard(
  tagsByCard: Map<number, Set<string>>,
  effectsByCard: Map<number, StructuredEffect[]>,
  cards: CardRow[],
  source: CardRow,
  cardsWithRequirements: Array<{ card: CardRow; requirement: ControlRequirement }>,
): ComboEntry | null {
  const parsed = toParsedEffects(effectsByCard.get(source.id) ?? []);
  const requirement = parsed.requirements[0];
  const deckPayoff = parsed.payoffs.find((p): p is SpecialSummonFromDeckPayoff => p.kind === 'special_summon_deck');
  const selfPayoff = parsed.payoffs.find((p): p is SelfSummonHandTributePayoff => p.kind === 'self_summon_hand_tribute_atk');
  const tributePayoff = parsed.payoffs.find(
    (p): p is TributeSpecialSummonPayoff => p.kind === 'tribute_special_summon',
  );

  const controlEnablers = requirement ? findEnablersForControl(tagsByCard, cards, requirement, source.id) : [];
  const tributeFodder = selfPayoff ? findTributeFodder(cards, selfPayoff, source.id) : [];
  const tributeNamedFodder = tributePayoff ? findTributeFodderByNames(cards, tributePayoff, source.id) : [];
  const summonSupport =
    isMonster(source.type) && (source.archetype || selfPayoff)
      ? findSummonSupport(tagsByCard, cards, source)
      : [];
  const deckTargets = deckPayoff ? findDeckTargets(cards, deckPayoff, source.id) : [];
  const namedTargets = tributePayoff ? findSummonTargetsByNames(cards, tributePayoff.summonNames, source.id) : [];
  const enabledCards =
    isMonster(source.type) && source.level ? findEnabledCards(cardsWithRequirements, source) : [];

  const enablers = mergePartners(MAX_ENABLERS, controlEnablers, tributeFodder, tributeNamedFodder, summonSupport);
  const targets = mergePartners(MAX_TARGETS, deckTargets, namedTargets, enabledCards);

  if (enablers.length === 0 && targets.length === 0) {
    return null;
  }

  return {
    tags: [...(tagsByCard.get(source.id) ?? [])],
    effects: (effectsByCard.get(source.id) ?? []).map((effect) => ({
      kind: effect.kind,
      payload: effect as Record<string, unknown>,
    })),
    requirements: parsed.requirements,
    payoffs: parsed.payoffs,
    enablers,
    targets,
    lines: buildLines(source, enablers, targets, enabledCards, cards, effectsByCard),
  };
}

async function main(): Promise<void> {
  const db = openDatabase();
  const meta = readMeta();
  const cards = db
    .prepare('SELECT id, name, type, level, atk, archetype, desc_en, tcg_date, ban_tcg FROM cards')
    .all() as CardRow[];

  const tagsByCard = loadTagsByCard(db);
  const effectsByCard = loadEffectsByCard(db);

  const cardsWithRequirements = cards
    .map((card) => {
      const requirement = toParsedEffects(effectsByCard.get(card.id) ?? []).requirements[0];
      return requirement ? { card, requirement } : null;
    })
    .filter((row): row is { card: CardRow; requirement: ControlRequirement } => row !== null);

  const entries: Record<string, ComboEntry> = {};
  let comboCards = 0;

  for (const source of cards) {
    const parsed = toParsedEffects(effectsByCard.get(source.id) ?? []);
    const hasComboSignals =
      parsed.requirements.length > 0 ||
      parsed.payoffs.length > 0 ||
      (isMonster(source.type) && !!source.archetype);
    if (!hasComboSignals) {
      continue;
    }

    const entry = buildEntryForCard(tagsByCard, effectsByCard, cards, source, cardsWithRequirements);
    if (!entry) {
      continue;
    }
    entries[String(source.id)] = entry;
    comboCards += 1;
  }

  db.close();

  const payload: ComboExport = {
    version: 2,
    generatedAt: new Date().toISOString(),
    cardCount: meta?.totalCards ?? cards.length,
    entries,
  };

  mkdirSync(join(REPO_ROOT, 'src', 'assets', 'data', 'card-knowledge'), { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(payload), 'utf8');

  const sizeMb = (Buffer.byteLength(JSON.stringify(payload)) / (1024 * 1024)).toFixed(2);
  console.log(`Exported ${comboCards} combo entries → ${EXPORT_PATH}`);
  console.log(`Approx size: ${sizeMb} MB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
