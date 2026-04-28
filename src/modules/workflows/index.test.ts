import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { bootstrap } from '../../server/bootstrap/index.js';
import {
  buildTool,
  setToolRegistryForTests,
  ToolRegistry,
} from '../../server/domains/tools/index.js';
import { workflowRoutes } from '../../server/domains/workflows.js';
import { DatabaseReferenceRepository } from '../database/repository.js';
import {
  WorkflowDefinitionRepository,
  WorkflowRunRepository,
  WorkflowService,
} from './index.js';

let tempRoot: string;
let previousRoot: string | undefined;
let originalRegistry: ToolRegistry | null = null;

function createTestToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(
    {
      name: 'test_echo',
      description: 'Return the provided payload.',
      inputSchema: {
        value: { type: 'string', optional: true },
        nested: { type: 'object', optional: true },
      },
      outputSchema: {
        echoed: { type: 'object' },
      },
    },
    async (input, _context, callId) => ({
      callId,
      output: { echoed: input },
    }),
  );
  registry.register(
    buildTool({
      definition: {
        name: 'test_fail',
        description: 'Always fail for workflow tests.',
        inputSchema: {},
      },
      inputValidator: z.object({}),
      async execute() {
        throw new Error('boom');
      },
    }).definition,
    async (_input, _context, callId) => ({
      callId,
      error: 'boom',
    }),
  );
  registry.register(
    {
      name: 'test_slow_fail',
      description: 'Fail after a short delay for workflow cancellation tests.',
      inputSchema: {},
    },
    async (_input, _context, callId) => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        callId,
        error: 'slow boom',
      };
    },
  );
  return registry;
}

async function waitForRunState(
  repository: WorkflowRunRepository,
  runId: string,
  predicate: (run: import('./schema.js').WorkflowRun) => boolean,
): Promise<import('./schema.js').WorkflowRun> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const run = await repository.getRun(runId);
    if (run && predicate(run)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for run ${runId}`);
}

async function waitForRun(
  repository: WorkflowRunRepository,
  runId: string,
  predicate: (status: string) => boolean,
): Promise<import('./schema.js').WorkflowRun> {
  return waitForRunState(repository, runId, (run) => predicate(run.status));
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fishboss-workflow-'));
  previousRoot = process.env.FISHBOSS_ROOT;
  process.env.FISHBOSS_ROOT = tempRoot;
  process.env.SERVER_SECRET = 'workflow-test-secret';

  originalRegistry = createTestToolRegistry();
  setToolRegistryForTests(originalRegistry);
});

afterEach(async () => {
  setToolRegistryForTests(null);

  if (previousRoot === undefined) {
    delete process.env.FISHBOSS_ROOT;
  } else {
    process.env.FISHBOSS_ROOT = previousRoot;
  }
  delete process.env.SERVER_SECRET;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('workflow repositories', () => {
  it('persists definitions and runs under workflow storage directories', async () => {
    const definitionRepository = new WorkflowDefinitionRepository();
    const runRepository = new WorkflowRunRepository();

    const workflow = await definitionRepository.createDefinition({
      id: 'repo-workflow',
      name: 'Repository workflow',
      description: 'Repository persistence',
      enabled: true,
      trigger: { type: 'manual', config: {} },
      nodes: [
        { id: 'start', name: 'Start', type: 'start', config: {} },
        { id: 'end', name: 'End', type: 'end', config: {} },
      ],
      edges: [{ from: 'start', to: 'end' }],
      variables: {},
    });

    const run = await runRepository.createRun({
      id: 'repo-run',
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      status: 'queued',
      triggerSource: 'manual',
      triggerPayload: {},
      context: {},
      nodeStates: {
        start: { nodeId: 'start', status: 'pending', attempt: 0 },
        end: { nodeId: 'end', status: 'pending', attempt: 0 },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const definitionPath = path.join(tempRoot, 'workflows', 'definitions', `${workflow.id}.json`);
    const runPath = path.join(tempRoot, 'workflows', 'runs', `${run.id}.json`);

    expect(JSON.parse(await fs.readFile(definitionPath, 'utf-8'))).toMatchObject({
      id: workflow.id,
      nodes: expect.any(Array),
      edges: expect.any(Array),
    });
    expect(JSON.parse(await fs.readFile(runPath, 'utf-8'))).toMatchObject({
      id: run.id,
      workflowId: workflow.id,
      status: 'queued',
    });
  });

  it('normalizes legacy step-based workflows on read', async () => {
    const definitionsDir = path.join(tempRoot, 'workflows', 'definitions');
    await fs.mkdir(definitionsDir, { recursive: true });
    await fs.writeFile(
      path.join(definitionsDir, 'legacy.json'),
      JSON.stringify(
        {
          id: 'legacy',
          name: 'Legacy workflow',
          description: 'old shape',
          enabled: true,
          steps: [
            { id: 'a', name: 'Agent', type: 'agent', config: { agentId: '1' }, next: ['b'] },
            { id: 'b', name: 'Condition', type: 'condition', config: { operator: 'equals' }, next: [] },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    const repository = new WorkflowDefinitionRepository();
    const workflow = await repository.getDefinition('legacy');

    expect(workflow).not.toBeNull();
    expect(workflow?.nodes).toHaveLength(2);
    expect(workflow?.edges).toEqual([
      expect.objectContaining({ from: 'a', to: 'b' }),
    ]);
    expect(workflow?.trigger.type).toBe('manual');
  });
});

describe('workflow service', () => {
  it('executes start -> tool -> condition -> databaseWrite -> end and persists node states', async () => {
    const service = new WorkflowService();
    const runRepository = new WorkflowRunRepository();
    const referenceRepository = new DatabaseReferenceRepository();

    const workflow = await service.create({
      id: 'service-workflow',
      name: 'Service workflow',
      description: 'Persistent run test',
      enabled: true,
      trigger: { type: 'manual', config: {} },
      variables: { owner: 'user-1' },
      nodes: [
        { id: 'start', name: 'Start', type: 'start', config: {} },
        {
          id: 'tool',
          name: 'Tool',
          type: 'tool',
          config: {
            toolName: 'test_echo',
            input: {
              value: '{{context.triggerPayload.message}}',
              nested: { ownerUserId: '{{context.variables.owner}}' },
            },
          },
        },
        {
          id: 'condition',
          name: 'Condition',
          type: 'condition',
          config: {
            left: '{{outputs.tool.output.echoed.value}}',
            right: 'hello',
            operator: 'equals',
          },
        },
        {
          id: 'write',
          name: 'Write',
          type: 'databaseWrite',
          config: {
            target: 'reference',
            id: 'workflow-reference-{{context.runId}}',
            namespace: 'workflow-output',
            ownerUserId: '{{context.variables.owner}}',
            title: 'Workflow output {{context.runId}}',
            content: {
              echoed: '{{outputs.tool.output.echoed.value}}',
              matched: '{{outputs.condition.matched}}',
            },
          },
        },
        {
          id: 'end',
          name: 'End',
          type: 'end',
          config: {
            output: '{{outputs.write.reference.id}}',
          },
        },
      ],
      edges: [
        { from: 'start', to: 'tool' },
        { from: 'tool', to: 'condition' },
        { from: 'condition', to: 'write', branch: 'true' },
        { from: 'condition', to: 'end', branch: 'false' },
        { from: 'write', to: 'end' },
      ],
    });

    const queuedRun = await service.run(workflow.id, {
      triggerSource: 'manual',
      triggerPayload: { message: 'hello' },
    });

    const run = await waitForRun(runRepository, queuedRun.id, (status) => status === 'succeeded');

    expect(run.status).toBe('succeeded');
    expect(run.result).toBe(`workflow-reference-${queuedRun.id}`);
    expect(run.nodeStates.start.status).toBe('succeeded');
    expect(run.nodeStates.tool.status).toBe('succeeded');
    expect(run.nodeStates.condition.status).toBe('succeeded');
    expect(run.nodeStates.write.status).toBe('succeeded');
    expect(run.nodeStates.end.status).toBe('succeeded');
    expect(run.nodeStates.tool.output).toMatchObject({
      toolName: 'test_echo',
      output: { echoed: { value: 'hello', nested: { ownerUserId: 'user-1' } } },
    });
    expect(run.nodeStates.condition.output).toMatchObject({ branch: 'true', matched: true });
    expect(run.nodeStates.write.attempt).toBe(1);

    const reference = await referenceRepository.get(`workflow-reference-${queuedRun.id}`);
    expect(reference).not.toBeNull();
    expect(reference).toMatchObject({
      namespace: 'workflow-output',
      ownerUserId: 'user-1',
      conversationId: queuedRun.id,
      content: { echoed: 'hello', matched: true },
    });
  });

  it('persists node and run errors when a tool node fails', async () => {
    const service = new WorkflowService();
    const runRepository = new WorkflowRunRepository();

    const workflow = await service.create({
      id: 'failing-workflow',
      name: 'Failing workflow',
      description: 'Failure persistence',
      enabled: true,
      trigger: { type: 'manual', config: {} },
      nodes: [
        { id: 'start', name: 'Start', type: 'start', config: {} },
        { id: 'tool', name: 'Tool', type: 'tool', config: { toolName: 'test_fail', input: {} } },
        { id: 'end', name: 'End', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'tool' },
        { from: 'tool', to: 'end' },
      ],
    });

    const queuedRun = await service.run(workflow.id, { triggerPayload: {} });
    const run = await waitForRun(runRepository, queuedRun.id, (status) => status === 'failed');

    expect(run.status).toBe('failed');
    expect(run.error).toBe('boom');
    expect(run.nodeStates.tool.status).toBe('failed');
    expect(run.nodeStates.tool.error).toBe('boom');
    expect(run.nodeStates.end.status).toBe('pending');
  });

  it('cancels a queued or running workflow without rewriting it to failed', async () => {
    const service = new WorkflowService();
    const runRepository = new WorkflowRunRepository();

    const workflow = await service.create({
      id: 'cancel-workflow',
      name: 'Cancel workflow',
      description: 'Cancellation persistence',
      enabled: true,
      trigger: { type: 'manual', config: {} },
      nodes: [
        { id: 'start', name: 'Start', type: 'start', config: {} },
        { id: 'tool', name: 'Tool', type: 'tool', config: { toolName: 'test_echo', input: { value: 'ok' } } },
        { id: 'end', name: 'End', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'tool' },
        { from: 'tool', to: 'end' },
      ],
    });

    const queuedRun = await service.run(workflow.id, { triggerPayload: {} });
    await service.cancelRun(queuedRun.id);

    const run = await waitForRun(runRepository, queuedRun.id, (status) => status === 'cancelled');
    expect(run.status).toBe('cancelled');
    expect(run.error).toBeUndefined();
  });

  it('keeps cancellation terminal when an in-flight tool fails after cancel', async () => {
    const service = new WorkflowService();
    const runRepository = new WorkflowRunRepository();

    const workflow = await service.create({
      id: 'cancel-slow-fail-workflow',
      name: 'Cancel slow fail workflow',
      description: 'Cancellation should win over late tool errors',
      enabled: true,
      trigger: { type: 'manual', config: {} },
      nodes: [
        { id: 'start', name: 'Start', type: 'start', config: {} },
        { id: 'tool', name: 'Tool', type: 'tool', config: { toolName: 'test_slow_fail', input: {} } },
        { id: 'end', name: 'End', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'tool' },
        { from: 'tool', to: 'end' },
      ],
    });

    const queuedRun = await service.run(workflow.id, { triggerPayload: {} });
    await waitForRunState(
      runRepository,
      queuedRun.id,
      (run) => run.nodeStates.tool?.status === 'running',
    );

    const cancelledRun = await service.cancelRun(queuedRun.id);
    expect(cancelledRun?.status).toBe('cancelled');
    expect(cancelledRun?.error).toBeUndefined();
    expect(cancelledRun?.nodeStates.tool.status).toBe('cancelled');

    await service.waitForRunIdle(queuedRun.id);
    const latestRun = await runRepository.getRun(queuedRun.id);
    expect(latestRun?.status).toBe('cancelled');
    expect(latestRun?.error).toBeUndefined();
    expect(latestRun?.nodeStates.tool.status).toBe('cancelled');
  });
});

describe('workflow routes', () => {
  it('exposes run lifecycle endpoints', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/workflows', register: workflowRoutes }],
      skipAuth: true,
    });

    const createResponse = await app.fastify.inject({
      method: 'POST',
      url: '/api/workflows',
      payload: {
        id: 'route-workflow',
        name: 'Route workflow',
        description: 'Route coverage',
        enabled: true,
        trigger: { type: 'manual', config: {} },
        nodes: [
          { id: 'start', name: 'Start', type: 'start', config: {} },
          { id: 'end', name: 'End', type: 'end', config: { output: '{{context.runId}}' } },
        ],
        edges: [{ from: 'start', to: 'end' }],
        variables: {},
      },
    });

    expect(createResponse.statusCode).toBe(201);

    const runResponse = await app.fastify.inject({
      method: 'POST',
      url: '/api/workflows/route-workflow/run',
      payload: { triggerPayload: { source: 'route' }, triggerSource: 'manual' },
    });
    expect(runResponse.statusCode).toBe(202);
    const runBody = runResponse.json() as { run: { id: string } };

    const runRepository = new WorkflowRunRepository();
    const completed = await waitForRun(runRepository, runBody.run.id, (status) => status === 'succeeded');
    expect(completed.result).toBe(runBody.run.id);

    const listRunsResponse = await app.fastify.inject({
      method: 'GET',
      url: '/api/workflows/runs?workflowId=route-workflow',
    });
    expect(listRunsResponse.statusCode).toBe(200);
    const listRunsBody = listRunsResponse.json() as { runs: Array<{ id: string; workflowId: string }> };
    expect(listRunsBody.runs.some((run) => run.id === runBody.run.id && run.workflowId === 'route-workflow')).toBe(true);

    const getRunResponse = await app.fastify.inject({
      method: 'GET',
      url: `/api/workflows/runs/${runBody.run.id}`,
    });
    expect(getRunResponse.statusCode).toBe(200);
    expect((getRunResponse.json() as { run: { id: string } }).run.id).toBe(runBody.run.id);

    const cancelResponse = await app.fastify.inject({
      method: 'POST',
      url: `/api/workflows/runs/${runBody.run.id}/cancel`,
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect((cancelResponse.json() as { run: { id: string; status: string } }).run.id).toBe(runBody.run.id);

    await app.stop();
  });
});
