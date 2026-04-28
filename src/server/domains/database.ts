import type { FastifyInstance } from "fastify";
import { createDatabaseRoutes } from "../../modules/database/index.js";
import {
  DatabaseMessageFilterQuerySchema,
  DatabaseMessageThreadFilterQuerySchema,
  DatabaseReferenceFilterQuerySchema,
} from "../../modules/database/schema.js";

export async function databaseRoutes(fastify: FastifyInstance): Promise<void> {
  const routes = createDatabaseRoutes();

  fastify.get("/status", async (_request, reply) => {
    return reply.send(await routes.getStatus());
  });

  fastify.get("/references", async (request, reply) => {
    return reply.send(
      await routes.listReferences(
        DatabaseReferenceFilterQuerySchema.parse(request.query),
      ),
    );
  });

  fastify.get("/references/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const reference = await routes.getReference(id);
    if (!reference) {
      return reply
        .status(404)
        .send({ code: 404, message: "Reference not found" });
    }
    return reply.send(reference);
  });

  fastify.put("/references/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    return reply.send(await routes.upsertReference(id, request.body));
  });

  fastify.delete("/references/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const deleted = await routes.deleteReference(id);
    if (!deleted) {
      return reply
        .status(404)
        .send({ code: 404, message: "Reference not found" });
    }
    return reply.send({ code: 0, message: "success" });
  });

  fastify.get("/message-threads", async (request, reply) => {
    return reply.send(
      await routes.listMessageThreads(
        DatabaseMessageThreadFilterQuerySchema.parse(request.query),
      ),
    );
  });

  fastify.get("/message-threads/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const thread = await routes.getMessageThread(id);
    if (!thread) {
      return reply.status(404).send({ code: 404, message: "Thread not found" });
    }
    return reply.send(thread);
  });

  fastify.put("/message-threads/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    return reply.send(await routes.upsertMessageThread(id, request.body));
  });

  fastify.delete("/message-threads/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const deleted = await routes.deleteMessageThread(id);
    if (!deleted) {
      return reply.status(404).send({ code: 404, message: "Thread not found" });
    }
    return reply.send({ code: 0, message: "success" });
  });

  fastify.get("/messages", async (request, reply) => {
    return reply.send(
      await routes.listMessages(
        DatabaseMessageFilterQuerySchema.parse(request.query),
      ),
    );
  });

  fastify.post("/messages", async (request, reply) => {
    return reply.status(201).send(await routes.appendMessage(request.body));
  });
}
