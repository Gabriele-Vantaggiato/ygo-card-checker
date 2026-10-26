export interface ConsensusOptions {
  /** Agreeing reads needed inside the window. */
  required: number;
  windowSize: number;
  /** A just-accepted key stays blocked until it has been unseen for this long. */
  cooldownMs: number;
}

/**
 * Debounces noisy per-frame OCR reads: a key is accepted once it appears
 * `required` times in the last `windowSize` frames, and is not accepted again
 * while the same card is still in front of the camera.
 */
export class ScanConsensus {
  private readonly window: string[] = [];
  private readonly lastSeen = new Map<string, number>();
  private readonly blocked = new Set<string>();

  constructor(private readonly options: ConsensusOptions) {}

  push(key: string | null, now: number): string | null {
    this.window.push(key ?? '');
    if (this.window.length > this.options.windowSize) {
      this.window.shift();
    }
    if (!key) {
      return null;
    }

    const previouslySeen = this.lastSeen.get(key);
    this.lastSeen.set(key, now);
    if (this.blocked.has(key)) {
      if (previouslySeen !== undefined && now - previouslySeen < this.options.cooldownMs) {
        return null;
      }
      this.blocked.delete(key);
    }

    if (this.window.filter((k) => k === key).length < this.options.required) {
      return null;
    }
    this.blocked.add(key);
    this.window.length = 0;
    return key;
  }
}
