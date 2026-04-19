import type { FastifyInstance } from 'fastify';
import { FrontendConfigService } from './service.js';

export async function registerFrontendConfigRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new FrontendConfigService();

  fastify.get('/', async (_request, reply) => {
    const config = await service.get();
    return reply.send({ config });
  });

  fastify.patch('/', async (request, reply) => {
    const config = await service.update(request.body);
    return reply.send({ config });
  });
}
