import { CardKnowledgeEffect } from '../../models/card-knowledge.model';

export function effectLabelKey(effect: CardKnowledgeEffect): string {
  return `knowledge.effect.${effect.kind}`;
}

export function effectLabelParams(effect: CardKnowledgeEffect): Record<string, string> | undefined {
  const payload = effect.payload;
  switch (effect.kind) {
    case 'control':
      return {
        level: String(payload['minLevel'] ?? ''),
        names: Array.isArray(payload['names']) ? (payload['names'] as string[]).join(' / ') : '',
      };
    case 'special_summon_deck':
      return {
        level: String(payload['minLevel'] ?? ''),
        names: Array.isArray(payload['names']) ? (payload['names'] as string[]).join(' / ') : '',
      };
    case 'self_summon_hand_tribute_atk':
      return {
        count: String(payload['tributeCount'] ?? ''),
        atk: String(payload['minAtk'] ?? ''),
      };
    case 'add_from_deck':
      return {
        names: Array.isArray(payload['names']) ? (payload['names'] as string[]).join(' / ') : '',
      };
    case 'tribute_special_summon':
      return {
        tribute:
          Array.isArray(payload['tributeNames']) ? (payload['tributeNames'] as string[]).join(' / ') : '',
        summon:
          Array.isArray(payload['summonNames']) ? (payload['summonNames'] as string[]).join(' / ') : '',
      };
    default:
      return undefined;
  }
}
