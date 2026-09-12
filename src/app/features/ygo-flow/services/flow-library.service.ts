import { Injectable, signal } from '@angular/core';
import { YgoFlowDocument } from '../../../models/ygo-flow.model';
import { isYgoFlowDocument } from './ygo-flow-io.service';

const KEY = 'ygo-flow-library-v1';

@Injectable({ providedIn: 'root' })
export class FlowLibraryService {
  readonly documents = signal<YgoFlowDocument[]>([]);
  readonly saveFailed = signal(false);
  private unreadable = false;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const docs: unknown = JSON.parse(raw);
      if (!Array.isArray(docs) || !docs.every(isYgoFlowDocument))
        throw new Error('Invalid archive');
      this.documents.set(docs);
    } catch {
      // Never overwrite an archive we could not read. New edits remain exportable.
      this.unreadable = true;
      this.saveFailed.set(true);
    }
  }

  save(doc: YgoFlowDocument): boolean {
    if (!doc.id || !isYgoFlowDocument(doc)) return false;
    this.documents.update((docs) =>
      [structuredClone(doc), ...docs.filter((d) => d.id !== doc.id)].sort((a, b) =>
        b.savedAt.localeCompare(a.savedAt),
      ),
    );
    return this.persist();
  }

  remove(id: string): boolean {
    this.documents.update((docs) => docs.filter((d) => d.id !== id));
    return this.persist();
  }

  private persist(): boolean {
    try {
      if (this.unreadable) throw new Error('Unreadable archive');
      localStorage.setItem(KEY, JSON.stringify(this.documents()));
      this.saveFailed.set(false);
      return true;
    } catch {
      this.saveFailed.set(true);
      return false;
    }
  }
}
