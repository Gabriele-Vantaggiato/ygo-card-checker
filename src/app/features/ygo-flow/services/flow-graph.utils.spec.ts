import { FlowCanvasState, FlowNode } from '../../../models/ygo-flow.model';
import { createsCycle, layoutFlow, visibleFlow } from './flow-graph.utils';
import { isYgoFlowDocument } from './ygo-flow-io.service';
const node = (id: string, collapsed = false): FlowNode => ({
  id,
  name: id,
  cardId: null,
  action: '',
  imageSmall: '',
  interrupts: [],
  x: 0,
  y: 0,
  collapsed,
});
const state = (): FlowCanvasState => ({
  nodes: [node('a'), node('b'), node('c'), node('d')],
  edges: [
    { id: 'ab', from: 'a', to: 'b' },
    { id: 'ac', from: 'a', to: 'c' },
    { id: 'bd', from: 'b', to: 'd' },
    { id: 'cd', from: 'c', to: 'd' },
  ],
  zoom: 1,
  panX: 0,
  panY: 0,
});
describe('Flow graph branching', () => {
  it('rejects cycles through multiple steps while allowing convergence', () => {
    expect(createsCycle(state().edges, 'd', 'a')).toBeTrue();
    expect(createsCycle(state().edges, 'b', 'c')).toBeFalse();
    expect(createsCycle([], 'a', 'a')).toBeTrue();
  });
  it('keeps a shared descendant visible through an expanded branch', () => {
    const s = state();
    s.nodes[1].collapsed = true;
    expect(visibleFlow(s).nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(visibleFlow(s).edges.some((e) => e.id === 'bd')).toBeFalse();
    s.nodes[2].collapsed = true;
    expect(visibleFlow(s).nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
  it('places converging nodes after both parents without overlap', () => {
    const result = layoutFlow(state());
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get('d')!.x).toBeGreaterThan(byId.get('b')!.x);
    expect(byId.get('b')!.y).not.toEqual(byId.get('c')!.y);
    expect(state().nodes[0].x).toBe(0);
  });
  it('handles a deep tree without recursive stack exhaustion', () => {
    const s: FlowCanvasState = {
      nodes: Array.from({ length: 1200 }, (_, i) => node(String(i))),
      edges: Array.from({ length: 1199 }, (_, i) => ({
        id: String(i),
        from: String(i),
        to: String(i + 1),
      })),
      zoom: 1,
      panX: 0,
      panY: 0,
    };
    expect(visibleFlow(s).nodes.length).toBe(1200);
    expect(layoutFlow(s).nodes[1199].x).toBeGreaterThan(300000);
  });
  it('accepts standalone trees with named conditions and notes', () => {
    const canvas = state();
    canvas.nodes[0].kind = 'condition';
    canvas.nodes[0].notes = 'Risorsa in mano';
    canvas.edges[0].label = 'Se disponibile';
    expect(
      isYgoFlowDocument(
        JSON.parse(
          JSON.stringify({
            version: 1,
            name: 'Test',
            ydke: '',
            canvas,
            roles: {},
            savedAt: new Date().toISOString(),
          }),
        ),
      ),
    ).toBeTrue();
  });
  it('rejects corrupted references, cycles and non-finite coordinates', () => {
    const doc = { version: 1, ydke: '', canvas: state(), roles: {} };
    doc.canvas.edges.push({ id: 'bad', from: 'd', to: 'a' });
    expect(isYgoFlowDocument(doc)).toBeFalse();
    doc.canvas = state();
    doc.canvas.edges[0].to = 'missing';
    expect(isYgoFlowDocument(doc)).toBeFalse();
    doc.canvas = state();
    doc.canvas.nodes[0].x = NaN;
    expect(isYgoFlowDocument(doc)).toBeFalse();
  });
});
