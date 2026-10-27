import type { ScanPhase } from '../services/collection-scanner.service';

export const SCAN_DEFAULT_HINT = 'Inquadra una carta dentro il riquadro';

/** What the scan panel tells the user it is doing; `progress` is the model download, 0..1. */
export function scanStatusText(phase: ScanPhase, progress: number): string {
  switch (phase) {
    case 'loading-model': {
      const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
      return `Scarico il modello di riconoscimento (24 MB)… ${pct}%`;
    }
    case 'loading-index':
      return "Carico l'indice delle carte…";
    case 'blurry':
      return 'Troppo sfocata: avvicina la carta e tienila ferma';
    case 'recognising':
      return 'Riconosco…';
    default:
      return SCAN_DEFAULT_HINT;
  }
}
