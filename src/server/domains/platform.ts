import type { FastifyInstance } from "fastify";
import { createPlatformRoutes } from "../../modules/platform/index.js";

export async function platformRoutes(fastify: FastifyInstance): Promise<void> {
  const routes = createPlatformRoutes();

  fastify.get("/", async (_request, reply) => {
    return reply.send(await routes.list());
  });

  fastify.get("/metadata", async (_request, reply) => {
    return reply.send(await routes.listMetadata());
  });

  fastify.get("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const platform = await routes.get(id);
    if (!platform) {
      return reply
        .status(404)
        .send({ code: 404, message: "Platform not found" });
    }
    return reply.send(platform);
  });

  fastify.post("/", async (request, reply) => {
    const platform = await routes.create(request.body);
    return reply.status(201).send(platform);
  });

  fastify.patch("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const platform = await routes.update(id, request.body);
    if (!platform) {
      return reply
        .status(404)
        .send({ code: 404, message: "Platform not found" });
    }
    return reply.send(platform);
  });

  fastify.delete("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const deleted = await routes.delete(id);
    if (!deleted) {
      return reply
        .status(404)
        .send({ code: 404, message: "Platform not found" });
    }
    return reply.send({ code: 0, message: "success" });
  });

  fastify.post("/:id/test", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const result = await routes.testConnection(id);
    return reply.send(result);
  });

  fastify.post("/:id/send", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = request.body as { target: string; message: unknown };
    const result = await routes.sendMessage(id, body.target, body.message);
    if (!result) {
      return reply
        .status(500)
        .send({ code: 500, message: "Failed to send message" });
    }
    return reply.send(result);
  });

  fastify.get("/:id/platform-metadata", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const metadata = await routes.getPlatformMetadata(id);
    if (!metadata) {
      return reply
        .status(404)
        .send({ code: 404, message: "Platform metadata not found" });
    }
    return reply.send(metadata);
  });

  fastify.get("/:id/runtime-status", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const status = await routes.getRuntimeStatus(id);
    if (!status) {
      return reply
        .status(404)
        .send({ code: 404, message: "Platform runtime not found" });
    }
    return reply.send(status);
  });

  fastify.post("/:id/runtime/start", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    return reply.send(await routes.startRuntime(id));
  });

  fastify.post("/:id/runtime/stop", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    return reply.send(await routes.stopRuntime(id));
  });
}
