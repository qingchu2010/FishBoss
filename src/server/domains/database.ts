import type { FastifyInstance } from "fastify";
import { createDatabaseRoutes } from "../../modules/database/index.js";

export async function databaseRoutes(fastify: FastifyInstance): Promise<void> {
  const routes = createDatabaseRoutes();

  fastify.get("/status", async (_request, reply) => {
    return reply.send(await routes.getStatus());
  });

  fastify.get("/references", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(
      await routes.listReferences({
              ownerUserId:
                typeof query.ownerUserId === "string" ? query.ownerUserId : undefined,
              namespace:
                typeof query.namespace === "string" ? query.namespace : undefined,
              conversationId:
                typeof query.conversationId === "string"
                  ? query.conversationId
                  : undefined,
              limit: typeof query.limit === "string" ? Number(query.limit) : 50,
              offset: typeof query.offset === "string" ? Number(query.offset) : 0,
            }),
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
}
