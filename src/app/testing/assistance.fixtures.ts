import { CardKnowledgeIndex } from '../models/card-knowledge.model';
import { EffectScript } from '../models/effect-script.model';
import { AssistanceBoard } from '../models/assistance.model';
export function knowledgeFixture(): CardKnowledgeIndex {
  const names = ['Source', 'Target', 'Target imposter', 'Sibling', 'Extra target'];
  return { version: 7, generatedAt: '', cardCount: 5,
    entries: Object.fromEntries(names.map((name, i) => [String(i + 1), {
      name, tags: [], series: i === 3 ? ['Family'] : [], mentions: [], effects: [], related: [],
      type: 'Effect Monster', race: i === 2 ? 'Dragon' : 'Zombie', attribute: 'DARK',
      level: i === 1 ? 4 : 8, atk: i === 1 ? 1500 : 3000,
      setcodes: i === 0 ? [0x1048] : i === 3 ? [0x48] : [], isExtraDeck: i === 4,
    }])),
    catalog: Object.fromEntries(names.map((name, i) => [String(i + 1), {
      id: i + 1, name, type: 'Effect Monster', race: i === 2 ? 'Dragon' : 'Zombie', attribute: 'DARK', archetype: null,
      tcgDate: '2000-01-01', banTcg: null, imageSmall: '',
    }])),
  };
}
export function scriptFixture(filter = 'Target'): EffectScript {
  return { cardId: 1, name: 'Source', roles: ['starter'], interrupts: [], timings: ['activate'],
    steps: [{ id: 'search', when: 'activate', actions: [{ op: 'search', from: 'deck', to: 'hand', filter, qty: 1 }] }],
    source: 'auto', confidence: 0.8, luaSource: '',
  };
}
export const boardFixture = (): AssistanceBoard => ({ hand: [1], deck: [2], extra: [], monsters: [], spellTraps: [], gy: [], banish: [] });
