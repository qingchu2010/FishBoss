import type { FastifyInstance } from 'fastify';
import { createMCPRoutes } from '../../modules/mcp/index.js';
import { registerCrudRoutes } from './http-register.js';

export async function mcpRoutes(fastify: FastifyInstance): Promise<void> {
  const routes = createMCPRoutes();

  await registerCrudRoutes(fastify, {
    list: () => routes.listServers(),
    get: (id) => routes.getServer(id),
    create: (data) => routes.createServer(data),
    update: (id, data) => routes.updateServer(id, data),
    delete: (id) => routes.deleteServer(id),
  }, 'servers');

  fastify.post('/:id/install', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await routes.installServer(id);
    return reply.send({ result });
  });

  fastify.post('/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await routes.startServer(id);
    return reply.send({ result });
  });

  fastify.post('/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await routes.stopServer(id);
    return reply.send({ result });
  });

  fastify.post('/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await routes.restartServer(id);
    return reply.send({ result });
  });

  fastify.get('/:id/tools', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tools = await routes.listTools(id);
    return reply.send({ tools });
  });

  fastify.get('/tools/all', async (_request, reply) => {
    const tools = await routes.listAllTools();
    return reply.send({ tools });
  });

  fastify.post('/:id/tools/call', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await routes.callTool(id, request.body);
    return reply.send({ result });
  });

  fastify.get('/:id/resources', async (request, reply) => {
    const { id } = request.params as { id: string };
    const resources = await routes.listResources(id);
    return reply.send({ resources });
  });

  fastify.get('/resources/read', async (request, reply) => {
    const { uri } = request.query as { uri: string };
    const result = await routes.readResource(uri);
    return reply.send({ result });
  });
}
