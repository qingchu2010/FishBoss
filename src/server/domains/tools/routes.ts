import type { FastifyInstance } from "fastify";
import { toolkitRegistry } from "../../../toolkit/index.js";
import { getToolRegistry } from "./index.js";

export async function toolRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async (_request, reply) => {
    const runtimeRegistry = getToolRegistry();
    const tools = toolkitRegistry.list().map((tool) => ({
      ...tool,
      executable: runtimeRegistry.has(tool.id),
    }));

    return reply.send({ tools });
  });
}
