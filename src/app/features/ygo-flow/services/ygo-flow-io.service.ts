import { createsCycle } from './flow-graph.utils';
import { Injectable } from '@angular/core';
import { FlowCanvasState, FlowNode, YgoFlowDocument } from '../../../models/ygo-flow.model';

export type YgoFlowIoResult<T> = { ok: true; value: T } | { ok: false; errorKey: string };

const NODE_W = 224;
const NODE_H = 208;
const PADDING = 60;
const EXPORT_SCALE = 2;

export function isYgoFlowDocument(value: unknown): value is YgoFlowDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Partial<YgoFlowDocument>;
  if (
    (doc.version !== 1 && doc.version !== 2) ||
    typeof doc.ydke !== 'string' ||
    !doc.canvas ||
    !Array.isArray(doc.canvas.nodes) ||
    !Array.isArray(doc.canvas.edges) ||
    !doc.roles ||
    typeof doc.roles !== 'object' ||
    Array.isArray(doc.roles)
  )
    return false;
  if (typeof doc.savedAt !== 'string' || (doc.savedAt && !Number.isFinite(Date.parse(doc.savedAt))))
    return false;
  if (doc.id !== undefined && (typeof doc.id !== 'string' || doc.id.length > 120)) return false;
  if (doc.seed !== undefined && (typeof doc.seed !== 'string' || doc.seed.length > 200))
    return false;
  if (doc.handSize !== undefined && doc.handSize !== 5 && doc.handSize !== 6) return false;
  if (doc.context !== undefined) {
    const c = doc.context;
    if (
      !c ||
      (c.deckId !== null && typeof c.deckId !== 'string') ||
      typeof c.deckName !== 'string' ||
      typeof c.deckUpdatedAt !== 'string' ||
      typeof c.formatId !== 'string' ||
      (c.banlistDate !== null && typeof c.banlistDate !== 'string')
    )
      return false;
  }
  if (
    doc.cards !== undefined &&
    (!Array.isArray(doc.cards) ||
      doc.cards.length > 300 ||
      doc.cards.some(
        (c) =>
          !c ||
          !Number.isSafeInteger(c.id) ||
          c.id <= 0 ||
          typeof c.name !== 'string' ||
          typeof c.type !== 'string' ||
          typeof c.desc !== 'string' ||
          !Array.isArray(c.card_images) ||
          c.card_images.some(
            (i) => !i || typeof i.image_url !== 'string' || typeof i.image_url_small !== 'string',
          ),
      ))
  )
    return false;
  if (doc.canvas.nodes.length > 1500 || doc.canvas.edges.length > 5000) return false;
  if (doc.name !== undefined && (typeof doc.name !== 'string' || doc.name.length > 200))
    return false;
  if (
    ![doc.canvas.zoom, doc.canvas.panX, doc.canvas.panY].every(
      (n) => typeof n === 'number' && Number.isFinite(n),
    )
  )
    return false;
  if (doc.canvas.zoom < 0.1 || doc.canvas.zoom > 4) return false;
  const ids = new Set<string>();
  for (const node of doc.canvas.nodes) {
    if (
      !node ||
      typeof node.id !== 'string' ||
      ids.has(node.id) ||
      typeof node.name !== 'string' ||
      typeof node.action !== 'string' ||
      typeof node.imageSmall !== 'string' ||
      !Number.isFinite(node.x) ||
      !Number.isFinite(node.y) ||
      !Array.isArray(node.interrupts)
    )
      return false;
    if (node.cardId !== null && (!Number.isSafeInteger(node.cardId) || node.cardId <= 0))
      return false;
    if (
      node.kind !== undefined &&
      !['start', 'action', 'condition', 'outcome', 'note'].includes(node.kind)
    )
      return false;
    if (node.notes !== undefined && typeof node.notes !== 'string') return false;
    if (node.collapsed !== undefined && typeof node.collapsed !== 'boolean') return false;
    if (
      node.interrupts.some((tag) => !['veiler', 'maxx_c', 'bottomless', 'nightmare'].includes(tag))
    )
      return false;
    if (node.card !== undefined) {
      const card = node.card;
      if (
        !card ||
        typeof card !== 'object' ||
        card.id !== node.cardId ||
        typeof card.name !== 'string' ||
        typeof card.type !== 'string' ||
        typeof card.desc !== 'string' ||
        !Array.isArray(card.card_images)
      )
        return false;
      if (
        card.card_images.some(
          (image) =>
            !image ||
            typeof image.image_url !== 'string' ||
            typeof image.image_url_small !== 'string' ||
            !Number.isSafeInteger(image.id),
        )
      )
        return false;
      if (
        ['atk', 'def', 'level'].some(
          (key) =>
            card[key as 'atk' | 'def' | 'level'] !== undefined &&
            !Number.isFinite(card[key as 'atk' | 'def' | 'level']),
        )
      )
        return false;
    }
    ids.add(node.id);
  }
  const checked: typeof doc.canvas.edges = [];
  const edgeIds = new Set<string>();
  for (const edge of doc.canvas.edges) {
    if (
      !edge ||
      typeof edge.id !== 'string' ||
      edgeIds.has(edge.id) ||
      !ids.has(edge.from) ||
      !ids.has(edge.to) ||
      (edge.label !== undefined && typeof edge.label !== 'string')
    )
      return false;
    if (
      checked.some((other) => other.from === edge.from && other.to === edge.to) ||
      createsCycle(checked, edge.from, edge.to)
    )
      return false;
    checked.push(edge);
    edgeIds.add(edge.id);
  }
  return Object.values(doc.roles).every((role) =>
    ['starter', 'extender', 'handtrap', 'interaction', 'untagged'].includes(role),
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
): void {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
      if (lines >= maxLines - 1) {
        break;
      }
    } else {
      line = candidate;
    }
  }
  if (line) {
    ctx.fillText(line, x, y + lines * lineHeight, maxWidth);
  }
}

/** `.ygoflow` document persistence: JSON / base64 round-trip and a static PNG snapshot of the canvas. */
@Injectable({ providedIn: 'root' })
export class YgoFlowIoService {
  serializeJson(doc: YgoFlowDocument): string {
    return JSON.stringify(doc, null, 2);
  }

  parseJson(raw: string): YgoFlowIoResult<YgoFlowDocument> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, errorKey: 'flow.io.error.invalidJson' };
    }
    if (!isYgoFlowDocument(parsed)) {
      return { ok: false, errorKey: 'flow.io.error.invalidFormat' };
    }
    return { ok: true, value: parsed };
  }

  serializeBase64(doc: YgoFlowDocument): string {
    return btoa(unescape(encodeURIComponent(this.serializeJson(doc))));
  }

  parseBase64(base64: string): YgoFlowIoResult<YgoFlowDocument> {
    let json: string;
    try {
      json = decodeURIComponent(escape(atob(base64.trim())));
    } catch {
      return { ok: false, errorKey: 'flow.io.error.invalidBase64' };
    }
    return this.parseJson(json);
  }

  downloadJson(doc: YgoFlowDocument, filename = 'deck.ygoflow'): void {
    this.triggerTextDownload(this.serializeJson(doc), filename, 'application/json');
  }

  downloadBase64(doc: YgoFlowDocument, filename = 'deck.ygoflow.b64.txt'): void {
    this.triggerTextDownload(this.serializeBase64(doc), filename, 'text/plain');
  }

  /** Renders nodes + bezier edges to an offscreen 2x canvas and downloads it as PNG. */
  async exportPng(
    state: FlowCanvasState,
    filename = 'ygoflow.png',
  ): Promise<YgoFlowIoResult<void>> {
    if (state.nodes.length === 0) {
      return { ok: false, errorKey: 'flow.io.error.emptyCanvas' };
    }

    const minX = Math.min(...state.nodes.map((n) => n.x));
    const minY = Math.min(...state.nodes.map((n) => n.y));
    const maxX = Math.max(...state.nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...state.nodes.map((n) => n.y + NODE_H));
    const width = maxX - minX + PADDING * 2;
    const height = maxY - minY + PADDING * 2;

    const scale = Math.min(
      EXPORT_SCALE,
      8192 / Math.max(width, height),
      Math.sqrt(24000000 / (width * height)),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { ok: false, errorKey: 'flow.io.error.canvasUnsupported' };
    }
    ctx.scale(scale, scale);

    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, width, height);

    const offsetX = -minX + PADDING;
    const offsetY = -minY + PADDING;
    const byId = new Map(state.nodes.map((n) => [n.id, n]));
    const center = (node: FlowNode) => ({
      x: node.x + offsetX + NODE_W / 2,
      y: node.y + offsetY + NODE_H / 2,
    });

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.lineWidth = 2;
    for (const edge of state.edges) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) {
        continue;
      }
      const a = center(from);
      a.x += NODE_W / 2;
      const b = center(to);
      b.x -= NODE_W / 2;
      const cx = a.x + (b.x - a.x) / 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(cx, a.y, cx, b.y, b.x, b.y);
      ctx.stroke();
      this.drawArrowHead(ctx, cx, b.y, b.x, b.y);
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(edge.label || '', cx, (a.y + b.y) / 2 - 12);
      ctx.textAlign = 'left';
    }

    for (const node of state.nodes) {
      const x = node.x + offsetX;
      const y = node.y + offsetY;

      ctx.fillStyle = '#111827';
      ctx.strokeStyle = 'rgba(148,163,184,0.45)';
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, NODE_W, NODE_H, 8);
      ctx.fill();
      ctx.stroke();

      if (node.imageSmall) {
        try {
          const img = await this.loadImage(node.imageSmall);
          ctx.drawImage(img, x + 10, y + 38, 64, 94);
        } catch {
          // No CORS / network access — keep the placeholder card back.
        }
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = '#d5b77a';
      ctx.fillText((node.kind || 'action').toUpperCase(), x + 10, y + 20);
      ctx.fillStyle = '#eee6d5';
      wrapText(
        ctx,
        node.name,
        x + (node.imageSmall ? 84 : 10),
        y + 45,
        NODE_W - (node.imageSmall ? 94 : 20),
        15,
        3,
      );

      if (node.action) {
        ctx.fillStyle = '#67e8f9';
        ctx.font = 'italic 10px system-ui, sans-serif';
        wrapText(ctx, node.action, x + 10, y + 152, NODE_W - 20, 13, 4);
      }

      if (node.interrupts.length > 0) {
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(x + NODE_W - 10, y + 10, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      return { ok: false, errorKey: 'flow.io.error.exportFailed' };
    }
    this.triggerBlobDownload(blob, filename);
    return { ok: true, value: undefined };
  }

  private drawArrowHead(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    x: number,
    y: number,
  ): void {
    const angle = Math.atan2(y - fromY, x - fromX);
    const size = 7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => {
        img.src = '';
        reject(new Error('image timeout'));
      }, 4000);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error('image load failed'));
      };
      img.src = src;
    });
  }

  private triggerTextDownload(content: string, filename: string, mime: string): void {
    this.triggerBlobDownload(new Blob([content], { type: mime }), filename);
  }

  private triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
