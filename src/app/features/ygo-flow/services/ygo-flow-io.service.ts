import { Injectable } from '@angular/core';
import { FlowCanvasState, FlowNode, YgoFlowDocument } from '../../../models/ygo-flow.model';

export type YgoFlowIoResult<T> = { ok: true; value: T } | { ok: false; errorKey: string };

const NODE_W = 128;
const NODE_H = 176;
const IMAGE_H = 140;
const PADDING = 60;
const EXPORT_SCALE = 2;

function isYgoFlowDocument(value: unknown): value is YgoFlowDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const doc = value as Partial<YgoFlowDocument>;
  return (
    doc.version === 1 &&
    typeof doc.ydke === 'string' &&
    typeof doc.canvas === 'object' &&
    doc.canvas !== null &&
    Array.isArray((doc.canvas as FlowCanvasState).nodes) &&
    Array.isArray((doc.canvas as FlowCanvasState).edges) &&
    typeof doc.roles === 'object' &&
    doc.roles !== null
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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
  async exportPng(state: FlowCanvasState, filename = 'ygoflow.png'): Promise<YgoFlowIoResult<void>> {
    if (state.nodes.length === 0) {
      return { ok: false, errorKey: 'flow.io.error.emptyCanvas' };
    }

    const minX = Math.min(...state.nodes.map((n) => n.x));
    const minY = Math.min(...state.nodes.map((n) => n.y));
    const maxX = Math.max(...state.nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...state.nodes.map((n) => n.y + NODE_H));
    const width = maxX - minX + PADDING * 2;
    const height = maxY - minY + PADDING * 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * EXPORT_SCALE));
    canvas.height = Math.max(1, Math.round(height * EXPORT_SCALE));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { ok: false, errorKey: 'flow.io.error.canvasUnsupported' };
    }
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE);

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
      const b = center(to);
      const cx = a.x + (b.x - a.x) / 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(cx, a.y, cx, b.y, b.x, b.y);
      ctx.stroke();
      this.drawArrowHead(ctx, cx, b.y, b.x, b.y);
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
          ctx.drawImage(img, x + 4, y + 4, NODE_W - 8, IMAGE_H - 8);
        } catch {
          // No CORS / network access — keep the placeholder card back.
        }
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 11px system-ui, sans-serif';
      wrapText(ctx, node.name, x + 6, y + IMAGE_H + 14, NODE_W - 12, 13);

      if (node.action) {
        ctx.fillStyle = '#67e8f9';
        ctx.font = 'italic 10px system-ui, sans-serif';
        wrapText(ctx, node.action, x + 6, y + NODE_H - 10, NODE_W - 12, 11, 1);
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

  private drawArrowHead(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, x: number, y: number): void {
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
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
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
