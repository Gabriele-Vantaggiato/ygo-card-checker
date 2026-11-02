import { Injectable, signal } from '@angular/core';
import { ComboSheet, isComboSheet } from './combo-sheet.model';

const KEY = 'ygo-combo-sheets-v1';
export const MAX_SHEET_BYTES = 2_000_000;

@Injectable({ providedIn: 'root' })
export class ComboSheetLibraryService {
  readonly sheets = signal<ComboSheet[]>([]);
  readonly storageFailed = signal(false);
  private unreadable = false;

  constructor() {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(data) || !data.every(isComboSheet)) throw new Error('Invalid archive');
      this.sheets.set(data);
    } catch {
      this.unreadable = true;
      this.storageFailed.set(true);
    }
  }

  save(sheet: ComboSheet): boolean {
    if (!isComboSheet(sheet) || new Blob([JSON.stringify(sheet)]).size > MAX_SHEET_BYTES) return false;
    this.sheets.update(all => [structuredClone(sheet), ...all.filter(s => s.id !== sheet.id)]);
    return this.persist();
  }

  remove(id: string): void {
    this.sheets.update(all => all.filter(s => s.id !== id));
    this.persist();
  }

  private persist(): boolean {
    try {
      if (this.unreadable) throw new Error('Unreadable archive');
      localStorage.setItem(KEY, JSON.stringify(this.sheets()));
      this.storageFailed.set(false);
      return true;
    } catch {
      this.storageFailed.set(true);
      return false;
    }
  }
}
