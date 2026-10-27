import { SCAN_DEFAULT_HINT, scanStatusText } from './scan-status.utils';

describe('scanStatusText', () => {
  it('shows the model download percentage, clamped', () => {
    expect(scanStatusText('loading-model', 0.426)).toBe('Scarico il modello di riconoscimento (24 MB)… 43%');
    expect(scanStatusText('loading-model', 2)).toContain('100%');
    expect(scanStatusText('loading-model', -1)).toContain('0%');
  });

  it('describes each active phase', () => {
    expect(scanStatusText('loading-index', 0)).toBe("Carico l'indice delle carte…");
    expect(scanStatusText('blurry', 0)).toBe('Troppo sfocata: avvicina la carta e tienila ferma');
    expect(scanStatusText('recognising', 0)).toBe('Riconosco…');
  });

  it('falls back to the default hint when idle or on OCR', () => {
    expect(scanStatusText('ready', 0)).toBe(SCAN_DEFAULT_HINT);
    expect(scanStatusText('ocr-fallback', 0)).toBe(SCAN_DEFAULT_HINT);
  });
});
