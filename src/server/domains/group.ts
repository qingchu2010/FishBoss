import type { FastifyInstance } from 'fastify';
import { createGroupRoutes } from '../../modules/group/index.js';

export async function groupRoutes(fastify: FastifyInstance): Promise<void> {
  const routes = createGroupRoutes();

  fastify.get('/status', async (_request, reply) => {
    return reply.send(await routes.getStatus());
  });

  fastify.get('/', async (_request, reply) => {
    return reply.send(await routes.list());
  });
}
