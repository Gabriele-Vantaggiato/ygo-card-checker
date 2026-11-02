import { ComboSheet, isComboSheet } from './combo-sheet.model';

/** MDPro4 1.0.6 local draft envelope, observed from a native-created draft. */
export function toMdpro4Draft(sheet: ComboSheet) {
  const id = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(sheet.id) ? sheet.id : crypto.randomUUID();
  return { id, remoteId: null, remoteOwnerId: null, remoteRevision: 0,
    updated: Math.floor(Date.now() / 1000), sheet: { ...structuredClone(sheet), id, sourceUrl: '' }, pending: null };
}

export function sheetFromImport(value: unknown): ComboSheet | null {
  if (isComboSheet(value)) return value;
  if (value && typeof value === 'object' && 'sheet' in value && isComboSheet(value.sheet)) return value.sheet;
  return null;
}
