import { Injectable, signal } from '@angular/core';
import { BanlistStatus } from '../models/ygo-format.model';
import { AddToDecklistPayload } from '../models/decklist.model';

export interface AddToDecklistDialogData {
  type: 'add-to-decklist';
  payload: AddToDecklistPayload;
  banlistStatus: BanlistStatus | null;
}

export type DialogRequest = AddToDecklistDialogData;

@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly active = signal<DialogRequest | null>(null);

  openAddToDecklist(payload: AddToDecklistPayload, banlistStatus: BanlistStatus | null): void {
    this.active.set({ type: 'add-to-decklist', payload, banlistStatus });
  }

  close(): void {
    this.active.set(null);
  }
}
