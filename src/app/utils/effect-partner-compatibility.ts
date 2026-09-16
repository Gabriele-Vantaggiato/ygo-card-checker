import { EffectScript } from '../models/effect-script.model';
import { CardKnowledgeEntry } from '../models/card-knowledge.model';

const RACES = ['zombie','dragon','warrior','spellcaster','machine','fiend','fairy','insect','plant','beast-warrior','beast','dinosaur','wyrm','cyberse','psychic','rock','aqua','thunder','pyro','sea serpent','winged beast','reptile','divine-beast','fish','illusion'];
/** Known target restrictions outrank generic GY/discard tags. Unknown filters are not guessed. */
export function graveyardTargetRaces(script: EffectScript | undefined): string[] | null {
  const actions = script?.steps.flatMap(s=>s.actions).filter(a=>a.op==='ss' && a.from==='gy') ?? [];
  if (!actions.length) return null;
  const races = actions.map(a => {
    const filter=(a.filter ?? '').toLowerCase().trim().replace(/-type/g,'');
    return RACES.find(r=>filter===`${r} monster` || filter===`${r} monsters`);
  });
  return races.every(r=>!!r) ? [...new Set(races as string[])] : null;
}
/** Mills from the Deck to the GY as its own effect (Foolish Burial, Armageddon Knight…) — a
 *  generic GY-fill enabler, not the archetype-specific payoff a revival effect later targets. */
function hasDeckMillAction(script: EffectScript | undefined): boolean {
  return script?.steps.some((s) => s.actions.some((a) => a.op === 'mill' && a.from === 'deck')) ?? false;
}
export function effectPartnersCompatible(source: CardKnowledgeEntry | undefined, candidate: CardKnowledgeEntry | undefined,
  sourceScript?: EffectScript, candidateScript?: EffectScript): boolean {
  const allows = (script: EffectScript | undefined, target: CardKnowledgeEntry | undefined, targetScript: EffectScript | undefined) => {
    const races=graveyardTargetRaces(script);
    if (!races || !target?.type?.toLowerCase().includes('monster')) return true;
    if (hasDeckMillAction(targetScript)) return true;
    return !!target.race && races.includes(target.race.toLowerCase());
  };
  return allows(sourceScript,candidate,candidateScript) && allows(candidateScript,source,sourceScript);
}
