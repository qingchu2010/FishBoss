import { bootstrap } from "./server/bootstrap/index.js";
import { getLogger } from "./server/logging/index.js";
import { getJobRegistry } from "./server/jobs/index.js";
import {
  conversationRoutes,
  agentRoutes,
  workflowRoutes,
  providerRoutes,
  mcpRoutes,
  skillRoutes,
  platformRoutes,
  groupRoutes,
  databaseRoutes,
  toolRoutes,
} from "./server/domains/index.js";
import { registerSystemRoutes } from "./modules/system/index.js";
import { registerAuthRoutes } from "./modules/auth/index.js";
import { registerLogsRoutes } from "./modules/logs/index.js";
import { registerFrontendConfigRoutes } from "./modules/frontend-config/index.js";
import { getQQGatewayRuntimeManager } from "./modules/platform/runtime/qq-gateway-runtime.js";
import { ensureDefaultPrompts } from "./prompts/index.js";

async function main(): Promise<void> {
  const logger = getLogger();

  try {
    logger.info("Starting FishBoss server...");

    await ensureDefaultPrompts();

    const app = await bootstrap({
      domains: [
        { prefix: "/api/system", register: registerSystemRoutes },
        { prefix: "/api/auth", register: registerAuthRoutes },
        { prefix: "/api/logs", register: registerLogsRoutes },
        {
          prefix: "/api/frontend-config",
          register: registerFrontendConfigRoutes,
        },
        { prefix: "/api/conversations", register: conversationRoutes },
        { prefix: "/api/agents", register: agentRoutes },
        { prefix: "/api/workflows", register: workflowRoutes },
        { prefix: "/api/providers", register: providerRoutes },
        { prefix: "/api/mcp", register: mcpRoutes },
        { prefix: "/api/skills", register: skillRoutes },
        { prefix: "/api/platform", register: platformRoutes },
        { prefix: "/api/group", register: groupRoutes },
        { prefix: "/api/database", register: databaseRoutes },
        { prefix: "/api/tools", register: toolRoutes },
      ],
      skipAuth: false,
    });

    const qqRuntimeManager = getQQGatewayRuntimeManager();

    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down gracefully...");
      await qqRuntimeManager.stopAll();
      await app.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down gracefully...");
      await qqRuntimeManager.stopAll();
      await app.stop();
      process.exit(0);
    });

    await app.start();
    await qqRuntimeManager.startEnabledPlatforms();

    const jobRegistry = getJobRegistry();
    jobRegistry.register("health-check", async () => {
      return { status: "healthy", timestamp: new Date().toISOString() };
    });

    jobRegistry.register("conversation-execute", async (job) => {
      const { conversationId, message } = job.data as {
        conversationId: string;
        message: string;
        model?: string;
        provider?: string;
        tools?: string[];
      };
      return { conversationId, message, status: "executed" };
    });

    logger.info("FishBoss server started successfully");
  } catch (error) {
    logger.fatal("Failed to start FishBoss server", error);
    process.exit(1);
  }
}

main();
