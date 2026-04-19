import type { FastifyInstance } from 'fastify';

export interface AsyncCrudHandler<TCreate = unknown, TUpdate = unknown> {
  list(): Promise<unknown>;
  get(id: string): Promise<unknown | null>;
  create(data: TCreate): Promise<unknown>;
  update(id: string, data: TUpdate): Promise<unknown | null>;
  delete(id: string): Promise<boolean>;
}

export async function registerCrudRoutes<TCreate = unknown, TUpdate = unknown>(
  fastify: FastifyInstance,
  handler: AsyncCrudHandler<TCreate, TUpdate>,
  resourceKey: string,
): Promise<void> {
  fastify.get('/', async (_request, reply) => {
    const items = await handler.list();
    return reply.send({ [resourceKey]: items });
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await handler.get(id);
    if (!item) {
      return reply.status(404).send({ error: `${resourceKey} not found` });
    }
    return reply.send({ [resourceKey.slice(0, -1)]: item });
  });

  fastify.post('/', async (request, reply) => {
    const item = await handler.create(request.body as TCreate);
    return reply.status(201).send({ [resourceKey.slice(0, -1)]: item });
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await handler.update(id, request.body as TUpdate);
    if (!item) {
      return reply.status(404).send({ error: `${resourceKey} not found` });
    }
    return reply.send({ [resourceKey.slice(0, -1)]: item });
  });

  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await handler.delete(id);
    if (!deleted) {
      return reply.status(404).send({ error: `${resourceKey} not found` });
    }
    return reply.status(204).send();
  });
}
