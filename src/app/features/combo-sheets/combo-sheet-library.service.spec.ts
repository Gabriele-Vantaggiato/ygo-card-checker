import { ComboSheetLibraryService } from './combo-sheet-library.service';
import { isComboSheet, newComboSheet } from './combo-sheet.model';

describe('Combo sheet archive', () => {
  let memory: Map<string, string>;
  beforeEach(() => {
    memory = new Map();
    spyOn(Storage.prototype, 'getItem').and.callFake(k => memory.get(k) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((k, v) => { memory.set(k, v); });
  });
  it('restores independent sheets and does not retain mutable draft references', () => {
    const library = new ComboSheetLibraryService();
    const sheet = newComboSheet();
    expect(library.save(sheet)).toBeTrue();
    sheet.title = 'changed';
    expect(new ComboSheetLibraryService().sheets()[0].title).not.toBe('changed');
    library.save(newComboSheet());
    expect(new ComboSheetLibraryService().sheets().length).toBe(2);
    library.remove(sheet.id);
    expect(new ComboSheetLibraryService().sheets().length).toBe(1);
  });
  it('keeps edits exportable when storage quota is exhausted', () => {
    (Storage.prototype.setItem as jasmine.Spy).and.throwError('QuotaExceededError');
    const library = new ComboSheetLibraryService();
    const sheet = newComboSheet();
    expect(library.save(sheet)).toBeFalse();
    expect(library.storageFailed()).toBeTrue();
    expect(library.sheets()[0]).toEqual(sheet);
  });
  it('preserves an unreadable archive', () => {
    memory.set('ygo-combo-sheets-v1', 'broken archive');
    const library = new ComboSheetLibraryService();
    expect(library.save(newComboSheet())).toBeFalse();
    expect(memory.get('ygo-combo-sheets-v1')).toBe('broken archive');
  });
  it('rejects invalid versions, IDs, duplicate tabs, bad diagrams and oversized lists', () => {
    const sheet = newComboSheet();
    expect(isComboSheet({ ...sheet, schemaVersion: 2 })).toBeFalse();
    expect(isComboSheet({ ...sheet, tabs: [sheet.tabs[0], sheet.tabs[0]] })).toBeFalse();
    sheet.tabs[0].combos[0].startingCards = [-1];
    expect(isComboSheet(sheet)).toBeFalse();
    sheet.tabs[0].combos[0].startingCards = [];
    sheet.tabs[0].combos[0].startFlow = [{ card: NaN, join: 'arrow', action: '', zone: '', caption: '' }];
    expect(isComboSheet(sheet)).toBeFalse();
    expect(isComboSheet({ ...newComboSheet(), tags: Array(31).fill('tag') })).toBeFalse();
  });
  it('round-trips a shipped MDPro4 guide without dropping annotations or occurrences', async () => {
    const fixture = await fetch('/test-fixtures/combo-sheets/mdpro4-chimera.json').then(r => r.json());
    expect(isComboSheet(fixture)).toBeTrue();
    const library = new ComboSheetLibraryService();
    expect(library.save(fixture)).toBeTrue();
    expect(new ComboSheetLibraryService().sheets()[0]).toEqual(fixture);
    expect(fixture.tabs[0].combos[0].startFlow.length).toBeGreaterThan(0);
    expect(fixture.tabs[0].combos[0].steps.some((s: { flow?: unknown[] }) => s.flow?.length)).toBeTrue();
  });
});
