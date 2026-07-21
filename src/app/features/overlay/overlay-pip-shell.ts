import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { CardRelatedResult } from '../../models/card-knowledge.model';
import {
  quantityLabelKeyForResult,
  verdictLabelKey,
} from '../../utils/legality-display.utils';

export interface OverlayPipSnapshot {
  card: YgoCard | null;
  legality: LegalityResult | null;
  related: CardRelatedResult;
  formatName: string;
  statusText: string;
  scanning: boolean;
  collapsed: boolean;
  t: (key: string, params?: Record<string, string>) => string;
}

export interface OverlayPipHandlers {
  onScan: () => void;
  onCollapse: () => void;
  onExpand: () => void;
}

/** Compact search-row layout — no nested scroll regions. */
const EXPANDED = { width: 360, height: 420 };
const COLLAPSED = { width: 44, height: 168 };

const PIP_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body {
    font-family: "Segoe UI", system-ui, sans-serif;
    background: linear-gradient(165deg, #0f1419 0%, #1a2332 55%, #121820 100%);
    color: #e8eef6;
  }
  .shell {
    display: flex; flex-direction: column; height: 100%;
    padding: 10px; gap: 8px; min-height: 0;
  }
  .topbar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.7;
    flex-shrink: 0;
  }
  .topbar-actions { display: flex; gap: 6px; }
  .scan, .icon-btn {
    border: 0; border-radius: 8px; padding: 7px 11px; font-weight: 700; font-size: 12px;
    cursor: pointer; white-space: nowrap;
  }
  .scan { background: #c9a227; color: #141413; }
  .scan:disabled { opacity: 0.55; cursor: wait; }
  .icon-btn { background: rgba(255,255,255,0.1); color: #e8eef6; padding: 6px 10px; }
  .status {
    font-size: 12px; line-height: 1.35; opacity: 0.85;
    min-height: 1.35em; flex-shrink: 0;
  }
  .empty {
    flex: 1; display: grid; place-items: center; text-align: center;
    border: 1px dashed rgba(255,255,255,0.18); border-radius: 14px; padding: 20px; opacity: 0.75;
  }
  .sheet {
    flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px;
    border: 1px solid rgba(255,255,255,0.12); border-radius: 14px;
    background: rgba(8,12,18,0.72); padding: 10px; overflow: hidden;
  }
  .row {
    display: flex; align-items: flex-start; gap: 10px; flex-shrink: 0;
  }
  .art {
    width: 48px; height: 70px; object-fit: cover; border-radius: 6px;
    background: #0a0e14; box-shadow: 0 4px 12px rgba(0,0,0,0.35); flex-shrink: 0;
  }
  .meta { flex: 1; min-width: 0; }
  .name {
    margin: 0; font-size: 14px; font-weight: 800; line-height: 1.25;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .type { margin: 2px 0 0; font-size: 11px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .facts { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
  .fact {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    font-size: 11px;
  }
  .fact-k {
    opacity: 0.55; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700;
  }
  .badge {
    display: inline-flex; align-items: center; border-radius: 999px;
    padding: 3px 9px; font-size: 11px; font-weight: 700;
  }
  .legal { background: #1f6f4a; color: #d8ffe9; }
  .restricted { background: #8a6a12; color: #ffe9a8; }
  .banned { background: #8a2030; color: #ffd0d8; }
  .qty { background: rgba(255,255,255,0.1); color: #e8eef6; }
  .fmt {
    margin-top: 2px; font-size: 10px; opacity: 0.55;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .extras { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
  details.block {
    border-radius: 10px; background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06); overflow: hidden; flex-shrink: 1; min-height: 0;
  }
  details.block summary {
    list-style: none; cursor: pointer; padding: 8px 10px;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.05em; opacity: 0.7; user-select: none;
  }
  details.block summary::-webkit-details-marker { display: none; }
  details.block[open] { display: flex; flex-direction: column; min-height: 0; }
  details.block[open] summary { opacity: 0.9; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .block-body {
    padding: 8px 10px 10px; font-size: 12px; line-height: 1.45;
    white-space: pre-wrap; overflow: auto; max-height: 9rem;
  }
  .related ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .related li { font-size: 12px; opacity: 0.9; padding: 2px 0; }

  body.collapsed { background: transparent; }
  .rail {
    width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; border: 0; cursor: pointer; padding: 8px 4px;
    background: linear-gradient(180deg, #1a2332 0%, #121820 100%);
    border-radius: 12px 0 0 12px;
    box-shadow: -4px 0 18px rgba(0,0,0,0.45);
    color: #f0d878;
  }
  .rail:hover { background: #243044; }
  .rail-arrow { font-size: 22px; font-weight: 900; line-height: 1; transform: translateX(-1px); }
  .rail-thumb {
    width: 28px; height: 40px; border-radius: 4px; object-fit: cover;
    background: #0a0e14; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .rail-label {
    writing-mode: vertical-rl; transform: rotate(180deg);
    font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
    opacity: 0.75; font-weight: 700;
  }
`;

export class OverlayPipShell {
  private win: Window | null = null;
  private handlers: OverlayPipHandlers | null = null;
  private collapsed = false;

  get open(): boolean {
    return !!this.win && !this.win.closed;
  }

  get isCollapsed(): boolean {
    return this.collapsed;
  }

  async openWindow(handlers: OverlayPipHandlers): Promise<boolean> {
    if (this.open) {
      this.handlers = handlers;
      return true;
    }
    if (typeof window === 'undefined' || !('documentPictureInPicture' in window)) {
      return false;
    }
    try {
      const dpi = (
        window as unknown as {
          documentPictureInPicture: {
            requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
          };
        }
      ).documentPictureInPicture;
      this.handlers = handlers;
      this.collapsed = false;
      this.win = await dpi.requestWindow({
        width: EXPANDED.width,
        height: EXPANDED.height,
      });
      this.win.document.title = 'YGO Checker Overlay';
      const style = this.win.document.createElement('style');
      style.textContent = PIP_CSS;
      this.win.document.head.appendChild(style);
      const root = this.win.document.createElement('div');
      root.className = 'shell';
      root.id = 'pip-root';
      root.innerHTML = this.shellHtml();
      this.win.document.body.appendChild(root);
      this.bindControls();
      this.win.addEventListener('pagehide', () => {
        this.win = null;
        this.collapsed = false;
      });
      return true;
    } catch {
      this.win = null;
      return false;
    }
  }

  close(): void {
    try {
      this.win?.close();
    } catch {
      // ignore
    }
    this.win = null;
    this.collapsed = false;
    this.handlers = null;
  }

  setCollapsed(collapsed: boolean): void {
    if (!this.open || !this.win) {
      return;
    }
    this.collapsed = collapsed;
    try {
      if (collapsed) {
        this.win.resizeTo(COLLAPSED.width, COLLAPSED.height);
      } else {
        this.win.resizeTo(EXPANDED.width, EXPANDED.height);
      }
    } catch {
      // some environments block resizeTo
    }
    this.win.document.body.classList.toggle('collapsed', collapsed);
  }

  render(snap: OverlayPipSnapshot): void {
    if (!this.open || !this.win) {
      return;
    }
    if (snap.collapsed !== this.collapsed) {
      this.setCollapsed(snap.collapsed);
    }

    const root = this.win.document.getElementById('pip-root');
    if (!root) {
      return;
    }

    if (snap.collapsed) {
      this.renderCollapsed(root, snap);
      return;
    }

    this.renderExpanded(root, snap);
  }

  private shellHtml(): string {
    return `
      <div class="topbar" id="pip-topbar">
        <span>YGO Overlay</span>
        <div class="topbar-actions">
          <button type="button" class="scan" id="scan-btn">Scan</button>
          <button type="button" class="icon-btn" id="collapse-btn" title="Minimize">—</button>
        </div>
      </div>
      <div class="status" id="pip-status"></div>
      <div id="pip-body" class="empty"></div>
    `;
  }

  private bindControls(): void {
    if (!this.win) {
      return;
    }
    this.win.document.getElementById('scan-btn')?.addEventListener('click', () => {
      this.handlers?.onScan();
    });
    this.win.document.getElementById('collapse-btn')?.addEventListener('click', () => {
      this.handlers?.onCollapse();
    });
  }

  private renderCollapsed(root: HTMLElement, snap: OverlayPipSnapshot): void {
    const img =
      snap.card?.card_images?.[0]?.image_url_small ??
      snap.card?.card_images?.[0]?.image_url ??
      '';
    root.innerHTML = `
      <button type="button" class="rail" id="expand-btn" title="${escapeAttr(snap.t('overlay.pip.expand'))}">
        <span class="rail-arrow" aria-hidden="true">◀</span>
        ${img ? `<img class="rail-thumb" src="${escapeAttr(img)}" alt="" />` : ''}
        <span class="rail-label">YGO</span>
      </button>
    `;
    this.win!.document.body.classList.add('collapsed');
    root.querySelector('#expand-btn')?.addEventListener('click', () => {
      this.handlers?.onExpand();
    });
  }

  private renderExpanded(root: HTMLElement, snap: OverlayPipSnapshot): void {
    this.win!.document.body.classList.remove('collapsed');
    if (!root.querySelector('#pip-body')) {
      root.className = 'shell';
      root.innerHTML = this.shellHtml();
      this.bindControls();
    }

    const statusEl = root.querySelector('#pip-status');
    const bodyEl = root.querySelector('#pip-body');
    const btn = root.querySelector('#scan-btn') as HTMLButtonElement | null;
    if (statusEl) {
      statusEl.textContent = snap.statusText;
    }
    if (btn) {
      btn.disabled = snap.scanning;
      btn.textContent = snap.scanning ? '…' : snap.t('overlay.pip.scan');
    }
    if (!bodyEl) {
      return;
    }
    if (!snap.card) {
      bodyEl.className = 'empty';
      bodyEl.innerHTML = `<p>${escapeHtml(snap.t('overlay.pip.waiting'))}</p>`;
      return;
    }

    const card = snap.card;
    const img =
      card.card_images?.[0]?.image_url_small ?? card.card_images?.[0]?.image_url ?? '';
    const legality = snap.legality;
    const verdictClass =
      legality?.verdict === 'legal'
        ? 'legal'
        : legality?.verdict === 'restricted'
          ? 'restricted'
          : 'banned';
    const playability = legality
      ? snap.t(verdictLabelKey(legality.verdict))
      : snap.t('overlay.pip.loadingLegality');
    const quantity = legality ? snap.t(quantityLabelKeyForResult(legality)) : '…';
    const related = (snap.related.suggestions ?? []).slice(0, 5);

    bodyEl.className = 'sheet';
    bodyEl.innerHTML = `
      <div class="row">
        ${img ? `<img class="art" src="${escapeAttr(img)}" alt="" />` : `<span class="art"></span>`}
        <div class="meta">
          <h2 class="name">${escapeHtml(card.name)}</h2>
          ${card.type ? `<p class="type">${escapeHtml(card.type)}</p>` : ''}
          <div class="facts">
            <div class="fact">
              <span class="fact-k">${escapeHtml(snap.t('history.playability'))}</span>
              <span class="badge ${verdictClass}">${escapeHtml(playability)}</span>
            </div>
            <div class="fact">
              <span class="fact-k">${escapeHtml(snap.t('history.quantity'))}</span>
              <span class="badge qty">${escapeHtml(quantity)}</span>
            </div>
          </div>
          ${snap.formatName ? `<p class="fmt">${escapeHtml(snap.formatName)}</p>` : ''}
        </div>
      </div>
      <div class="extras">
        ${
          card.desc
            ? `<details class="block">
                <summary>${escapeHtml(snap.t('overlay.pip.effect'))}</summary>
                <div class="block-body">${escapeHtml(card.desc)}</div>
              </details>`
            : ''
        }
        ${
          related.length
            ? `<details class="block related">
                <summary>${escapeHtml(snap.t('overlay.pip.related'))}</summary>
                <div class="block-body">
                  <ul>${related.map((s) => `<li>${escapeHtml(s.name)}</li>`).join('')}</ul>
                </div>
              </details>`
            : ''
        }
      </div>
    `;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
