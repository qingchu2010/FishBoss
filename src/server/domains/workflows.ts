import type { FastifyInstance } from 'fastify';
import { createWorkflowRoutes } from '../../modules/workflows/index.js';
import {
  RunWorkflowInputSchema,
  WorkflowIdParamsSchema,
  WorkflowRunIdParamsSchema,
  WorkflowRunListQuerySchema,
} from '../../modules/workflows/schema.js';

export async function workflowRoutes(fastify: FastifyInstance): Promise<void> {
  const routes = createWorkflowRoutes();

  fastify.get('/', async (_request, reply) => {
    const workflows = await routes.list();
    return reply.send({ workflows });
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = WorkflowIdParamsSchema.parse(request.params);
    const workflow = await routes.get(id);
    if (!workflow) {
      return reply.status(404).send({ error: 'workflow not found' });
    }
    return reply.send({ workflow });
  });

  fastify.post('/', async (request, reply) => {
    const workflow = await routes.create(request.body);
    return reply.status(201).send({ workflow });
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = WorkflowIdParamsSchema.parse(request.params);
    const workflow = await routes.update(id, request.body);
    if (!workflow) {
      return reply.status(404).send({ error: 'workflow not found' });
    }
    return reply.send({ workflow });
  });

  fastify.delete('/:id', async (request, reply) => {
    const { id } = WorkflowIdParamsSchema.parse(request.params);
    const deleted = await routes.delete(id);
    if (!deleted) {
      return reply.status(404).send({ error: 'workflow not found' });
    }
    return reply.status(204).send();
  });

  fastify.post('/:id/run', async (request, reply) => {
    const { id } = WorkflowIdParamsSchema.parse(request.params);
    const run = await routes.run(id, RunWorkflowInputSchema.parse(request.body ?? {}));
    return reply.status(202).send({ run });
  });

  fastify.post('/:id/execute', async (request, reply) => {
    const { id } = WorkflowIdParamsSchema.parse(request.params);
    const run = await routes.run(id, RunWorkflowInputSchema.parse(request.body ?? {}));
    return reply.status(202).send({ run });
  });

  fastify.get('/runs', async (request, reply) => {
    const runs = await routes.listRuns(WorkflowRunListQuerySchema.parse(request.query ?? {}));
    return reply.send({ runs });
  });

  fastify.get('/runs/:runId', async (request, reply) => {
    const { runId } = WorkflowRunIdParamsSchema.parse(request.params);
    const run = await routes.getRun(runId);
    if (!run) {
      return reply.status(404).send({ error: 'workflow run not found' });
    }
    return reply.send({ run });
  });

  fastify.post('/runs/:runId/cancel', async (request, reply) => {
    const { runId } = WorkflowRunIdParamsSchema.parse(request.params);
    const run = await routes.cancelRun(runId);
    if (!run) {
      return reply.status(404).send({ error: 'workflow run not found' });
    }
    return reply.send({ run });
  });
}
