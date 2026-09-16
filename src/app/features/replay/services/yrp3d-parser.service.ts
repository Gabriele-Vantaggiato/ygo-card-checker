import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { ParsedReplay } from '../../../models/replay.model';
import { sha256Hex } from '../utils/file-hash.utils';
import { normalizeYrp3d } from '../utils/yrp3d-normalize';

const MAX_BYTES = 8 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class Yrp3dParserService {
  readonly maxBytes = MAX_BYTES;

  parseFile$(file: File): Observable<ParsedReplay> {
    return from(this.parseFile(file));
  }

  async parseFile(file: File): Promise<ParsedReplay> {
    if (!file.name.toLowerCase().endsWith('.yrp3d')) {
      throw new Error('replay.error.badExtension');
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw new Error('replay.error.fileSize');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = await sha256Hex(bytes);

    const { YGOProYrp3d } = await import('ygopro-yrp3d-encode');
    let yrp3d;
    try {
      yrp3d = new YGOProYrp3d().fromYrp3d(bytes);
    } catch {
      throw new Error('replay.error.parseFailed');
    }

    if (!yrp3d.messages?.length) {
      throw new Error('replay.error.emptyReplay');
    }

    return normalizeYrp3d(yrp3d as Parameters<typeof normalizeYrp3d>[0], {
      fileName: file.name,
      sha256,
      byteLength: bytes.byteLength,
    });
  }
}
