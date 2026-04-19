import type { FastifyInstance } from 'fastify';
import { createWorkflowRoutes } from '../../modules/workflows/index.js';
import { registerCrudRoutes } from './http-register.js';

export async function workflowRoutes(fastify: FastifyInstance): Promise<void> {
  const routes = createWorkflowRoutes();

  await registerCrudRoutes(fastify, routes, 'workflows');

  fastify.post('/:id/execute', async (request, reply) => {
    const { id } = request.params as { id: string };
    const execution = await routes.execute(id, request.body);
    return reply.status(202).send({ execution });
  });

  fastify.get('/executions/:executionId', async (request, reply) => {
    const { executionId } = request.params as { executionId: string };
    const execution = routes.getExecution(executionId);
    if (!execution) {
      return reply.status(404).send({ error: 'execution not found' });
    }
    return reply.send({ execution });
  });

  fastify.post('/executions/:executionId/stop', async (request, reply) => {
    const { executionId } = request.params as { executionId: string };
    const stopped = routes.stopExecution(executionId);
    if (!stopped) {
      return reply.status(404).send({ error: 'execution not found' });
    }
    return reply.send({ stopped: true });
  });
}
