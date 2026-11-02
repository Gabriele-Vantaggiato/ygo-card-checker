import { newComboSheet } from './combo-sheet.model';
import { sheetFromImport, toMdpro4Draft } from './combo-sheet-io';

describe('MDPro4 draft interchange', () => {
  it('creates a local-only native envelope with matching identities and an independent sheet', () => {
    const sheet = newComboSheet(); const draft = toMdpro4Draft(sheet);
    expect(draft.id).toBe(sheet.id); expect(draft.sheet.id).toBe(draft.id);
    expect(draft.remoteId).toBeNull(); expect(draft.pending).toBeNull(); expect(draft.sheet.sourceUrl).toBe('');
    draft.sheet.title = 'Changed'; expect(sheet.title).not.toBe('Changed');
  });
  it('imports both raw sheets and native local draft files', () => {
    const sheet = newComboSheet(); const draft = toMdpro4Draft(sheet);
    expect(sheetFromImport(sheet)).toEqual(sheet);
    expect(sheetFromImport(draft)?.title).toBe(sheet.title);
    expect(sheetFromImport({ sheet: { schemaVersion: 99 } })).toBeNull();
  });
});
