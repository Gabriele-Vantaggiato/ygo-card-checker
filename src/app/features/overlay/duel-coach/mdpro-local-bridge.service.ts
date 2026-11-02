import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ComboSheet, isComboSheet } from '../../combo-sheets/combo-sheet.model';
import { validDeck } from './duel-coach.model';

export interface MdproBridgeSnapshot {
  activeDeck: { name: string; ydke: string };
  capture: { id: string; updated: number; sheet: ComboSheet } | null;
  live?: { active: boolean; limited: boolean; sessionId: string; sheet: ComboSheet | null; observedAt: number; deck: { name: string; ydke: string } | null; pid: number | null } | null;
}
@Injectable({ providedIn: 'root' })
export class MdproLocalBridgeService {
  readonly snapshot = signal<MdproBridgeSnapshot | null>(null);
  readonly connected = signal(false);
  readonly connecting = signal(false);
  readonly error = signal('');
  private version = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private currentHint: unknown = null;
  publishHint(hint: unknown): void { this.currentHint = hint; if (this.connected()) void this.sendHint(); }
  private async sendHint(): Promise<void> {
    if (!this.currentHint || !this.connected()) return;
    try { await fetch('http://127.0.0.1:4718/coach',{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify(this.currentHint),credentials: 'omit',signal: AbortSignal.timeout(3000) }); }
    catch { /* Connection errors are surfaced by the snapshot probe. */ }
  }
  constructor() { inject(DestroyRef).onDestroy(() => this.disconnect()); }
  connect(): void {
    this.disconnect(); this.connected.set(true); this.connecting.set(true); this.error.set('');
    void this.poll(this.version);
  }
  disconnect(): void {
    this.version++; if (this.timer) clearTimeout(this.timer); this.timer = null;
    this.abort?.abort(); this.abort = null; this.connected.set(false); this.connecting.set(false); this.snapshot.set(null);
  }
  private async poll(version: number): Promise<void> {
    const abort = new AbortController(); this.abort = abort;
    const deadline = setTimeout(() => abort.abort(),5000);
    try {
      const response = await fetch('http://127.0.0.1:4718/snapshot',{ signal: abort.signal,cache: 'no-store',credentials: 'omit' });
      if (!response.ok) throw new Error('Bridge unavailable');
      const raw: unknown = JSON.parse(await response.text());
      if (!raw || typeof raw !== 'object') throw new Error('Invalid response');
      const snapshot = raw as MdproBridgeSnapshot;
      if (!snapshot.activeDeck || typeof snapshot.activeDeck.name !== 'string' || snapshot.activeDeck.name.length > 200) throw new Error('Invalid deck');
      validDeck(snapshot.activeDeck.ydke);
      if (snapshot.capture && (typeof snapshot.capture.id !== 'string' || snapshot.capture.id.length > 120 ||
        !Number.isFinite(snapshot.capture.updated) || !isComboSheet(snapshot.capture.sheet))) throw new Error('Invalid capture');
      if (snapshot.live && (typeof snapshot.live.active !== 'boolean' || typeof snapshot.live.limited !== 'boolean' || typeof snapshot.live.sessionId !== 'string' || snapshot.live.sessionId.length > 120 || !Number.isFinite(snapshot.live.observedAt) ||
        (snapshot.live.active && (!isComboSheet(snapshot.live.sheet) || !snapshot.live.deck)))) throw new Error('Invalid live recorder');
      if (snapshot.live?.deck) validDeck(snapshot.live.deck.ydke);
      if (version !== this.version) return;
      this.snapshot.set(snapshot); this.error.set(''); void this.sendHint();
    } catch {
      if (version === this.version) { this.snapshot.set(null); this.error.set('Collegamento locale non raggiungibile. Avvia il tool MDPro4 coach e consenti la connessione locale se il browser la richiede.'); }
    } finally {
      clearTimeout(deadline);
      if (version === this.version) { this.connecting.set(false); this.timer = setTimeout(() => { void this.poll(version); },this.snapshot()?.live?.active ? 300 : 2000); }
    }
  }
}
