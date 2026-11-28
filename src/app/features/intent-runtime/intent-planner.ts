import type { WorkspaceDefinition } from './intent-contract';

type Layout = Pick<WorkspaceDefinition, 'columns' | 'theme' | 'scale' | 'panels'>;
type Plan = Layout & { samples: number | null };

export async function requestWorkspacePlan(
  intent: string,
  layout: Layout,
  operation: 'create' | 'modify',
): Promise<Plan> {
  const response = await fetch('/intent-api/api/hand-workspace-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent,
      operation,
      layout: { ...layout, panels: layout.panels.map(({ kind, visible }) => ({ kind, visible })) },
    }),
    signal: AbortSignal.timeout(95000),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Planner non disponibile. Avvia il server locale di Intent Runtime.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Planner non disponibile.');
  return {
    ...result,
    panels: result.panels.map(({ kind, visible }: Layout['panels'][number]) => {
      const panel = layout.panels.find((entry) => entry.kind === kind);
      if (!panel) throw new Error('Il piano contiene un pannello sconosciuto.');
      return { ...panel, visible };
    }),
  };
}
