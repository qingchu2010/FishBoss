import type { FastifyInstance } from 'fastify';
import { createProviderRoutes } from '../../modules/providers/index.js';
import { registerCrudRoutes } from './http-register.js';

export async function providerRoutes(fastify: FastifyInstance): Promise<void> {
  const routes = createProviderRoutes();

  fastify.get('/metadata', async (_request, reply) => {
    const metadata = await routes.listProviderMetadata();
    return reply.send(metadata);
  });

  await registerCrudRoutes(fastify, routes, 'providers');

  fastify.get('/:id/models', async (request, reply) => {
    const { id } = request.params as { id: string };
    const models = await routes.listModels(id);
    return reply.send({ models });
  });

  fastify.get('/:id/models/:modelId', async (request, reply) => {
    const { id, modelId } = request.params as { id: string; modelId: string };
    const model = await routes.getModel(id, modelId);
    if (!model) {
      return reply.status(404).send({ error: 'model not found' });
    }
    return reply.send({ model });
  });

  fastify.post('/:id/models', async (request, reply) => {
    const { id } = request.params as { id: string };
    const model = await routes.addCustomModel(id, request.body);
    if (!model) {
      return reply.status(404).send({ error: 'provider not found' });
    }
    return reply.status(201).send({ model });
  });

  fastify.post('/test', async (request, reply) => {
    const result = await routes.testModel(request.body);
    return reply.send({ result });
  });

  fastify.post('/fetch-models', async (request, reply) => {
    const result = await routes.fetchModels(request.body);
    return reply.send(result);
  });
}
