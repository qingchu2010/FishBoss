import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  TestAgentSchema,
  ListAgentsQuerySchema,
} from './schemas.js';
import { getAgentService } from './service.js';
import { NotFoundError } from '../../errors/index.js';
import { z } from 'zod';

const agentParamsSchema = z.object({
  id: z.string(),
});

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  const service = getAgentService();

  fastify.get(
    '/',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = ListAgentsQuerySchema.parse(request.query);
      const agents = await service.listAgents({
        limit: query.limit,
        offset: query.offset,
      });
      return reply.send({ agents });
    }
  );

  fastify.get<{ Params: z.infer<typeof agentParamsSchema> }>(
    '/:id',
    async (request, reply) => {
      const { id } = agentParamsSchema.parse(request.params);
      const agent = await service.getAgent(id);
      if (!agent) {
        throw new NotFoundError('Agent');
      }
      return reply.send({ agent });
    }
  );

  fastify.post(
    '/',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateAgentSchema.parse(request.body);
      const agent = await service.createAgent(data);
      return reply.status(201).send({ agent });
    }
  );

  fastify.patch<{ Params: z.infer<typeof agentParamsSchema> }>(
    '/:id',
    async (request, reply) => {
      const { id } = agentParamsSchema.parse(request.params);
      const data = UpdateAgentSchema.parse(request.body);
      const agent = await service.updateAgent(id, data);
      if (!agent) {
        throw new NotFoundError('Agent');
      }
      return reply.send({ agent });
    }
  );

  fastify.delete<{ Params: z.infer<typeof agentParamsSchema> }>(
    '/:id',
    async (request, reply) => {
      const { id } = agentParamsSchema.parse(request.params);
      const deleted = await service.deleteAgent(id);
      if (!deleted) {
        throw new NotFoundError('Agent');
      }
      return reply.status(204).send();
    }
  );

  fastify.post(
    '/test',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = TestAgentSchema.parse(request.body);
      const result = await service.testAgent(data);
      return reply.send({ result });
    }
  );

  fastify.post(
    '/test/stream',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = TestAgentSchema.parse(request.body);
      const result = await service.testAgentStreaming(data);
      return reply.send({ result });
    }
  );

  fastify.get<{ Params: z.infer<typeof agentParamsSchema> }>(
    '/:id/tools',
    async (request, reply) => {
      const { id } = agentParamsSchema.parse(request.params);
      const agent = await service.getAgent(id);
      if (!agent) {
        throw new NotFoundError('Agent');
      }
      return reply.send({
        tools: agent.tools,
        toolPermissions: agent.toolPermissions,
      });
    }
  );
}
