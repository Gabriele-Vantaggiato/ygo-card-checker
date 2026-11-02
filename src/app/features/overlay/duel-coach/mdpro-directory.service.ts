import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { YdkeSections, ydkeSectionsToUrl } from '../../../services/ydke.service';
import { validDeck } from './duel-coach.model';

interface ReadDirectory {
  name: string;
  getDirectoryHandle(name: string): Promise<ReadDirectory>;
  getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>;
}
export function activeDeckName(config: string): string {
  const name = /^DeckInUse->(.+)$/m.exec(config)?.[1]?.trim();
  if (!name || name.length > 180 || /[\\/\x00-\x1f]/.test(name) || name === '.' || name === '..') throw new Error('Mazzo in uso non trovato nella configurazione.');
  return name;
}
export function parseYdk(text: string): YdkeSections {
  const sections: YdkeSections = { main: [], extra: [], side: [] };
  let section: keyof YdkeSections = 'main';
  if (text.length > 100_000) throw new Error('File YDK troppo grande.');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '#main') section = 'main';
    else if (line === '#extra') section = 'extra';
    else if (line === '!side') section = 'side';
    else if (/^\d+$/.test(line)) sections[section].push(Number(line));
    else if (line && !line.startsWith('#')) throw new Error('Riga YDK non valida.');
  }
  validDeck(ydkeSectionsToUrl(sections));
  return sections;
}
/** Read-only access granted by the browser picker; no native executable or game modification. */
@Injectable({ providedIn: 'root' })
export class MdproDirectoryService {
  readonly active = signal<{ name: string; ydke: string } | null>(null);
  readonly error = signal('');
  readonly connected = signal(false);
  readonly supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  private root: ReadDirectory | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private reading = false;
  constructor() { inject(DestroyRef).onDestroy(() => this.disconnect()); }
  async connect(): Promise<void> {
    if (!this.supported) { this.error.set('Selezione cartella disponibile in Chrome o Edge su desktop. Puoi incollare l’YDKE.'); return; }
    try {
      const root = await (window as unknown as { showDirectoryPicker(options: { mode: string }): Promise<ReadDirectory> }).showDirectoryPicker({ mode: 'read' });
      this.disconnect(); this.root = root; this.connected.set(true);
      await this.refresh();
      this.timer = setInterval(() => { void this.refresh(); }, 2000);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) this.error.set('Impossibile aprire la cartella MDPro4.');
    }
  }
  disconnect(): void {
    this.generation++; this.root = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.connected.set(false); this.active.set(null); this.error.set('');
  }
  private async refresh(): Promise<void> {
    if (this.reading || !this.root) return;
    this.reading = true; const generation = this.generation; const root = this.root;
    try {
      const data = await root.getDirectoryHandle('Data');
      const config = await (await data.getFileHandle('config.conf')).getFile();
      if (config.size > 100_000) throw new Error('Config too large');
      const name = activeDeckName(await config.text());
      const dir = await root.getDirectoryHandle('Deck');
      const file = await (await dir.getFileHandle(name.endsWith('.ydk') ? name : `${name}.ydk`)).getFile();
      if (file.size > 100_000) throw new Error('Deck too large');
      const ydke = ydkeSectionsToUrl(parseYdk(await file.text()));
      if (generation !== this.generation) return;
      // A deck-editor selection is a candidate, never proof of a running duel's deck.
      this.active.set({ name, ydke }); this.error.set('');
    } catch {
      if (generation === this.generation) { this.active.set(null); this.error.set('Mazzo non leggibile. Seleziona la cartella che contiene MDPro4.exe; controlla che il mazzo sia salvato.'); }
    } finally { this.reading = false; }
  }
}
