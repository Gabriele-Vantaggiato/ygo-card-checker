import { FlowCanvasState, FlowEdge, FlowNode } from '../../../models/ygo-flow.model';

export const FLOW_NODE_WIDTH = 224;
export const FLOW_NODE_HEIGHT = 208;

export function createsCycle(edges: readonly FlowEdge[], from: string, to: string): boolean {
  if (from === to) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  const queue = [to];
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.pop()!;
    if (id === from) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(outgoing.get(id) ?? []));
  }
  return false;
}

export function visibleFlow(state: FlowCanvasState): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  const targets = new Set(state.edges.map((edge) => edge.to));
  for (const edge of state.edges)
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  const queue = state.nodes.filter((node) => !targets.has(node.id)).map((node) => node.id);
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!byId.get(id)?.collapsed) queue.push(...(children.get(id) ?? []));
  }
  return {
    nodes: state.nodes.filter((node) => seen.has(node.id)),
    edges: state.edges.filter(
      (edge) => seen.has(edge.from) && seen.has(edge.to) && !byId.get(edge.from)?.collapsed,
    ),
  };
}

/** Topological layering supports both branching and converging paths without recursive depth limits. */
export function layoutFlow(state: FlowCanvasState): FlowCanvasState {
  const incoming = new Map(state.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of state.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }
  const queue = state.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  const depth = new Map(queue.map((id) => [id, 0]));
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const child of outgoing.get(id) ?? []) {
      depth.set(child, Math.max(depth.get(child) ?? 0, (depth.get(id) ?? 0) + 1));
      incoming.set(child, (incoming.get(child) ?? 1) - 1);
      if (incoming.get(child) === 0) queue.push(child);
    }
  }
  const rows = new Map<number, number>();
  const nodes = state.nodes.map((node) => {
    const level = depth.get(node.id) ?? 0;
    const row = rows.get(level) ?? 0;
    rows.set(level, row + 1);
    return {
      ...node,
      x: 64 + level * (FLOW_NODE_WIDTH + 100),
      y: 64 + row * (FLOW_NODE_HEIGHT + 64),
    };
  });
  return { ...state, nodes };
}

export function flowBounds(nodes: readonly FlowNode[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!nodes.length) return { x: 0, y: 0, width: 700, height: 450 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + FLOW_NODE_WIDTH);
    maxY = Math.max(maxY, node.y + FLOW_NODE_HEIGHT);
  }
  return { x: minX - 40, y: minY - 40, width: maxX - minX + 80, height: maxY - minY + 80 };
}
