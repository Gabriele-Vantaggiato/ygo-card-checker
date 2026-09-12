import { FlowLibraryService } from './flow-library.service';
import { YgoFlowDocument } from '../../../models/ygo-flow.model';
import { flowTemplate } from './flow-study.utils';
import { isYgoFlowDocument } from './ygo-flow-io.service';

const doc = (id: string): YgoFlowDocument => ({
  version: 2,
  id,
  name: id,
  ydke: '',
  canvas: flowTemplate('opening'),
  roles: { '1': 'interaction' },
  savedAt: new Date().toISOString(),
  seed: 'test',
  handSize: 6,
});
describe('Flow library persistence', () => {
  let memory: Map<string, string>;
  beforeEach(() => {
    memory = new Map();
    spyOn(Storage.prototype, 'getItem').and.callFake((k) => memory.get(k) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((k, v) => {
      memory.set(k, v);
    });
  });
  it('keeps separate immutable documents and restores them after reload', () => {
    const library = new FlowLibraryService(),
      first = doc('first');
    library.save(first);
    library.save(doc('second'));
    first.canvas.nodes[0].name = 'Changed after save';
    const restored = new FlowLibraryService();
    expect(restored.documents().length).toBe(2);
    expect(restored.documents().find((d) => d.id === 'first')!.canvas.nodes[0].name).not.toBe(
      first.canvas.nodes[0].name,
    );
    expect(restored.documents().every(isYgoFlowDocument)).toBeTrue();
  });
  it('reports quota failure while keeping the current edits exportable', () => {
    (Storage.prototype.setItem as jasmine.Spy).and.throwError('QuotaExceededError');
    const library = new FlowLibraryService();
    expect(library.save(doc('new'))).toBeFalse();
    expect(library.saveFailed()).toBeTrue();
    expect(library.documents()[0].id).toBe('new');
  });
  it('never overwrites an unreadable archive', () => {
    memory.set('ygo-flow-library-v1', 'broken archive');
    const library = new FlowLibraryService();
    expect(library.save(doc('new'))).toBeFalse();
    expect(memory.get('ygo-flow-library-v1')).toBe('broken archive');
  });
  it('supports removing and restoring the same complete document', () => {
    const library = new FlowLibraryService(),
      original = doc('recover');
    library.save(original);
    library.remove('recover');
    expect(new FlowLibraryService().documents()).toEqual([]);
    library.save(original);
    expect(new FlowLibraryService().documents()[0]).toEqual(original);
  });
  it('rejects malformed optional version 2 metadata while accepting legacy documents', () => {
    expect(isYgoFlowDocument({ ...doc('v1'), version: 1 })).toBeTrue();
    expect(isYgoFlowDocument({ ...doc('bad'), handSize: 7 })).toBeFalse();
    expect(isYgoFlowDocument({ ...doc('bad'), context: { deckId: 123 } })).toBeFalse();
    expect(isYgoFlowDocument({ ...doc('bad'), cards: [{ id: -2 }] })).toBeFalse();
    expect(isYgoFlowDocument({ ...doc('bad'), savedAt: 'not-a-date' })).toBeFalse();
  });
});
