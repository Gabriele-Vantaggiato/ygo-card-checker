import { Decklist } from '../../models/decklist.model';
import { EffectAction, EffectScriptIndex } from '../../models/effect-script.model';
import { ObservedLine } from '../../models/duel-line.model';
import { resolveDeckSection, splitDeckIntoYdkeSections } from '../../services/ydke.service';
import { deckKey } from '../../utils/replay-lines';
import { ComboSheet, ComboSheetGuide, ComboSheetStep } from './combo-sheet.model';
import { ComboDeckRecipe, matchDeckRecipes } from './combo-deck-recipe';

export interface ComboGenerationResult {
  sheet: ComboSheet | null;
  templates: number;
  observed: number;
  drafts: number;
  coveredCards: number;
  mainCards: number;
}

/** Bounded teaching-sheet assembly. Never treats parsed effects as a duel simulator. */
export function generateComboSheet(
  deck: Decklist,
  index: EffectScriptIndex,
  observations: readonly ObservedLine[],
  rabbitTemplate: ComboSheet | null,
  format: string,
  italian = true,
  recipes: readonly ComboDeckRecipe[] = [],
): ComboGenerationResult {
  const t = (it: string, en: string) => italian ? it : en;
  const sections = splitDeckIntoYdkeSections(deck.cards);
  const available = new Set([...sections.main, ...sections.extra]);
  const quantities = (ids: number[]) => {
    const result = new Map<number, number>();
    for (const id of ids) result.set(id, (result.get(id) ?? 0) + 1);
    return result;
  };
  const main = quantities(sections.main);
  const extra = quantities(sections.extra);
  const names = new Map(deck.cards.filter(c => resolveDeckSection(c) !== 'side').map(c => [c.id, c.name]));
  const name = (id: number) => names.get(id) ?? `#${id}`;
  const tabs: ComboSheet['tabs'] = [];

  // Exact supported recipe: Side Deck cards and missing second copies never satisfy it.
  const templates: ComboSheetGuide[] = matchDeckRecipes(deck, recipes);
  if ((main.get(85138716) ?? 0) >= 1 && (main.get(37265642) ?? 0) >= 2) {
    for (const guide of rabbitTemplate?.tabs.flatMap(tab => tab.combos) ?? []) {
      if (guide.endCards.length === 1 && [74294676, 42752141].includes(guide.endCards[0]) && extra.has(guide.endCards[0])) {
        templates.push(structuredClone(guide));
      }
    }
  }
  if (templates.length) tabs.push({ id: 'templates', title: t('Linee da modello', 'Template routes'), combos: templates });

  const observed: ComboSheetGuide[] = [];
  const groups = new Map<string, ObservedLine[]>();
  const fingerprint = deckKey(sections);
  for (const row of observations) {
    if (row.deckKey !== fingerprint || !row.uninterrupted || !row.actions.length ||
      row.actions.some(action => !available.has(action.cardId)) ||
      [...quantities(row.openingHand)].some(([id, count]) => (main.get(id) ?? 0) < count)) continue;
    // Different hands, master rules and turns remain separate; repetitions are preserved.
    const groupKey = JSON.stringify([[...row.openingHand].sort((a,b) => a-b), row.masterRule, row.turn, row.actions]);
    const group = groups.get(groupKey) ?? [];
    if (!group.some(item => item.replayId === row.replayId)) group.push(row);
    groups.set(groupKey, group);
  }
  for (const rows of [...groups.values()].slice(0, 20)) {
    const row = rows[0];
    const actionText = { normal_summon: t('Evocazione Normale', 'Normal Summon'), special_summon: t('Evocazione Speciale', 'Special Summon'), activate: t('Attivazione', 'Activation'), set: t('Posizionamento', 'Set') };
    observed.push({
      id: `observed-${observed.length}`, title: `${name(row.actions[0].cardId)} · ${rows.length} replay`.slice(0, 200),
      description: t(`Sequenza osservata in ${rows.length} replay senza azioni avversarie registrate. Master Rule ${row.masterRule}, turno ${row.turn}. Conserva l’intera mano iniziale. Il formato selezionato e il campo finale non sono verificati.`, `Sequence observed in ${rows.length} replays without recorded opponent actions. Master Rule ${row.masterRule}, turn ${row.turn}. Retains the full opening hand. Selected format and endboard are not verified.`),
      startingCards: [...row.openingHand], endCards: [], requiredCards: [], playsAround: [],
      steps: row.actions.map(action => ({ title: `${actionText[action.kind]} · ${name(action.cardId)}`.slice(0, 200),
        text: t('Azione registrata: non dimostra la risoluzione dell’effetto né l’efficacia in altri duelli.', 'Recorded action: does not prove effect resolution or effectiveness in other duels.'),
        kind: action.kind.includes('summon') ? 'summon' : 'action', cards: [action.cardId],
      })),
    });
  }
  if (observed.length) tabs.push({ id: 'observed', title: t('Sequenze osservate', 'Observed sequences'), combos: observed });

  // These are conditional effect worksheets, not fabricated complete combos.
  const drafts: ComboSheetGuide[] = [];
  const triggers: Record<string, string> = {
    normal_summon: t('Se Evocata Normalmente', 'If Normal Summoned'),
    special_summon: t('Se Evocata Specialmente', 'If Special Summoned'),
    activate: t('All’attivazione', 'On activation'), gy: t('Dal Cimitero', 'From the GY'),
    ignition: t('Effetto di accensione', 'Ignition effect'), trigger: t('Alla condizione di innesco', 'On its trigger condition'),
    quick: t('Effetto rapido', 'Quick effect'), passive: t('Effetto continuo', 'Continuous effect'), set: t('Se posizionata', 'If Set'),
  };
  const verbs: Record<string, string> = { search: t('Cerca', 'Search'), add: t('Aggiungi', 'Add'), ss: t('Evoca Specialmente', 'Special Summon'), ns: t('Evoca Normalmente', 'Normal Summon'), set: t('Posiziona', 'Set'), destroy: t('Distruggi', 'Destroy'), draw: t('Pesca', 'Draw'), discard: t('Scarta', 'Discard'), mill: t('Manda al Cimitero', 'Send to GY'), banish: t('Bandisci', 'Banish'), negate: t('Nega', 'Negate'), xyz: t('Evoca Xyz', 'Xyz Summon'), synchro: t('Evoca Synchro', 'Synchro Summon'), note: t('Nota', 'Note') };
  const constraintLabels: Record<string, string> = { nameContains: t('nome contenente', 'name contains'), race: t('Tipo', 'Type'), cardType: t('tipo carta', 'card type'), minLevel: t('Livello minimo', 'minimum Level'), maxLevel: t('Livello massimo', 'maximum Level'), minAtk: 'ATK min', maxAtk: 'ATK max', excludeSource: t('escludi questa carta', 'exclude this card') };
  const describe = (action: EffectAction) => [verbs[action.op] || action.op, action.qty, action.filter,
    action.from ? `${t('da', 'from')} ${action.from}` : '', action.to ? `${t('a', 'to')} ${action.to}` : '',
    action.note, action.constraints ? Object.entries(action.constraints).map(([key, value]) => `${constraintLabels[key] || key}: ${value}`).join(' · ') : '',
  ].filter(value => value !== undefined && value !== '').join(' · ');
  for (const id of main.keys()) {
    const script = index.scripts[String(id)];
    if (!script?.roles.includes('starter') || !script.steps.length || drafts.length >= 20) continue;
    const steps: ComboSheetStep[] = script.steps.slice(0, 30).map(step => ({
      title: (triggers[step.when] || step.when).slice(0, 200),
      text: [t('Effetto da collegare: il verificarsi di questa condizione non è dimostrato dai passaggi precedenti.', 'Effect to connect: previous steps do not establish that this condition occurs.'),
        step.cost?.length ? `${t('Costi', 'Costs')}: ${step.cost.join(' · ')}` : t('Costi non specificati nei dati: controllare il testo della carta.', 'Costs unspecified in data: check the card text.'),
        ...step.actions.map(describe)].join('\n').slice(0, 20000),
      kind: 'note', cards: [id],
    }));
    drafts.push({ id: `starter-${id}`, title: `${name(id)} · ${t('bozza', 'draft')}`.slice(0, 200),
      description: t(`Effetti strutturati della carta (${script.source}). Sono condizioni da studiare separatamente, non una combo già eseguibile. Mancano la scelta dei bersagli, la verifica dei costi, dei limiti per turno e delle restrizioni.`, `Structured card effects (${script.source}). Study these conditions separately; this is not an executable combo. Target selection, costs, once-per-turn limits and restrictions still need verification.`),
      startingCards: [id], endCards: [], requiredCards: [], playsAround: [], steps,
    });
  }
  if (drafts.length) tabs.push({ id: 'drafts', title: t('Starter da sviluppare', 'Starters to develop'), combos: drafts });
  const coveredCards = [...main.keys()].filter(id => index.scripts[String(id)]?.steps.length).length;
  return { templates: templates.length, observed: observed.length, drafts: drafts.length, coveredCards, mainCards: main.size,
    sheet: tabs.length ? {
      schemaVersion: 1, id: crypto.randomUUID(), title: `${t('Combo', 'Combos')} · ${deck.name}`.slice(0, 200),
      author: 'YGOCardChecker', accent: 'cyan', tags: [t('Generata dal mazzo', 'Generated from deck'), t('Da verificare', 'Needs review')],
      description: `${t('Mazzo', 'Deck')}: ${deck.name}. ${t('Versione', 'Version')}: ${deck.updatedAt}. ${t('Contesto da verificare', 'Context to verify')}: ${format}.\n${t('Modelli con requisiti controllati, azioni osservate e bozze degli effetti sono separati. Nessuna simulazione completa del duello o certificazione di legalità.', 'Templates with checked requirements, observed actions and effect drafts are kept separate. No full duel simulation or legality certification.')}`.slice(0, 20000), tabs,
    } : null,
  };
}
