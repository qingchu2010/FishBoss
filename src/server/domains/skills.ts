import type { FastifyInstance } from 'fastify';
import { createSkillRoutes } from '../../modules/skills/index.js';
import { registerCrudRoutes } from './http-register.js';

export async function skillRoutes(fastify: FastifyInstance): Promise<void> {
  const routes = createSkillRoutes();

  await registerCrudRoutes(fastify, routes, 'skills');

  fastify.post('/import', async (request, reply) => {
    const result = await routes.importSkill(request.body);
    return reply.send({ result });
  });

  fastify.get('/:id/commands', async (request, reply) => {
    const { id } = request.params as { id: string };
    const commands = await routes.listCommands(id);
    return reply.send({ commands });
  });

  fastify.post('/:id/execute', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await routes.execute(id, request.body);
    return reply.send({ result });
  });
}
