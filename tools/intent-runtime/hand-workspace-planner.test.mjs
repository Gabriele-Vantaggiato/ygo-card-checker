import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkspacePlan, planHandWorkspace, planHandWorkspaceWithCodex, validPlanRequest } from './hand-workspace-planner.mjs';

const layout = {
  columns: 2, theme: 'duel', scale: 'normal',
  panels: ['metrics', 'opening-hand', 'starter-chart', 'frequency-chart', 'combinations', 'decklist']
    .map((kind) => ({ kind, visible: true })),
};
const input = { intent: 'Simula 500 mani e usa una colonna', operation: 'create', layout };

test('planner accepts only the supported workspace shape and grants', () => {
  assert.equal(validPlanRequest(input), true);
  assert.equal(validPlanRequest({ ...input, grants: ['deck.write'] }), false);
  assert.throws(() => applyWorkspacePlan({ actions: [{ capability: 'deck.write' }] }, input), /non autorizzata/);
  assert.throws(() => applyWorkspacePlan({
    actions: [{ capability: 'workspace.compose', layout: { ...layout, panels: Array(6).fill(layout.panels[0]) } }],
  }, input), /layout non valido/);
  assert.throws(() => applyWorkspacePlan({
    actions: [{ capability: 'hand.simulate', samples: 100001 }],
  }, input), /numero di simulazioni/);
});

test('provider receives only planning context and can set layout and deterministic inputs', async () => {
  const fetcher = async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.deepEqual(JSON.parse(body.messages.at(-1).content), input);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ actions: [
      { capability: 'workspace.compose', layout: { ...layout, columns: 1 } },
      { capability: 'hand.simulate', samples: 500 },
    ] }) } }] });
  };
  assert.deepEqual(await planHandWorkspace(input, { key: 'test', model: 'test', fetcher }), {
    ...layout, columns: 1, samples: 500,
  });
});

test('subscription planner requires ChatGPT login and validates Codex output', async () => {
  await assert.rejects(
    planHandWorkspaceWithCodex(input, async () => 'Logged in using an API key'),
    /ChatGPT/,
  );
  const run = async (args, prompt) => {
    if (args[0] === 'login') return 'Logged in using ChatGPT';
    assert.ok(args.includes('--ephemeral'));
    assert.ok(args.includes('--output-schema'));
    assert.match(prompt, /Simula 500 mani/);
    return JSON.stringify({ actions: [{ capability: 'hand.simulate', samples: 500 }] });
  };
  assert.deepEqual(await planHandWorkspaceWithCodex(input, run), { ...layout, samples: 500 });
});
