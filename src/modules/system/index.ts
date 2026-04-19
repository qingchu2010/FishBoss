import type { FastifyInstance } from "fastify";
import { getStoragePaths } from "../../storage/index.js";
import { readdirSync, existsSync, statSync, readFileSync } from "fs";
import { join } from "path";
import os from "os";

const VERSION = "0.1.0";

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).length;
  } catch {
    return 0;
  }
}

function getDirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let size = 0;
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      try {
        const stat = statSync(filePath);
        size += stat.size;
      } catch {}
    }
  } catch {}
  return size;
}

function getProvidersData(storage: ReturnType<typeof getStoragePaths>) {
  const providers: Array<{
    id: string;
    name: string;
    type: string;
    models: string[];
    enabled: boolean;
  }> = [];

  if (!existsSync(storage.providers)) return providers;

  try {
    const files = readdirSync(storage.providers);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = readFileSync(join(storage.providers, file), "utf-8");
        const data = JSON.parse(content);
        providers.push({
          id: data.id,
          name: data.name,
          type: data.type || "custom",
          models: data.models || [],
          enabled: data.enabled !== false,
        });
      } catch {}
    }
  } catch {}

  return providers;
}

function getAgentsCount(storage: ReturnType<typeof getStoragePaths>): number {
  const agentsDir = join(storage.data, "agents");
  if (!existsSync(agentsDir)) return 0;
  try {
    return readdirSync(agentsDir).filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

export async function registerSystemRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const storage = getStoragePaths();

  fastify.get("/health", async () => ({
    status: "ok",
    version: VERSION,
    timestamp: new Date().toISOString(),
  }));

  fastify.get("/stats", async () => {
    const mem = process.memoryUsage();
    const providers = getProvidersData(storage);
    const agentsCount = getAgentsCount(storage);

    const enabledProviders = providers.filter((p) => p.enabled);
    const totalModels = providers.reduce((sum, p) => sum + p.models.length, 0);

    const modelDistribution: Record<string, number> = {};
    providers.forEach((p) => {
      const type = p.type || "custom";
      modelDistribution[type] =
        (modelDistribution[type] || 0) + p.models.length;
    });

    const providerByType: Record<string, { total: number; enabled: number }> =
      {};
    providers.forEach((p) => {
      const type = p.type || "custom";
      if (!providerByType[type]) {
        providerByType[type] = { total: 0, enabled: 0 };
      }
      providerByType[type].total++;
      if (p.enabled) {
        providerByType[type].enabled++;
      }
    });

    return {
      uptime: process.uptime(),
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
      },
      counts: {
        prompts: countFiles(storage.prompts),
        config: countFiles(storage.config),
        data: countFiles(storage.data),
        auth: countFiles(storage.auth),
        logs: countFiles(storage.logs),
        database: countFiles(storage.database),
        workflows: countFiles(storage.workflows),
        providers: providers.length,
        mcp: countFiles(storage.mcp),
        skills: countFiles(storage.skills),
      },
      dashboard: {
        providers: {
          total: providers.length,
          enabled: enabledProviders.length,
          byType: providerByType,
        },
        agents: {
          total: agentsCount,
        },
        models: {
          total: totalModels,
          distribution: modelDistribution,
        },
        system: {
          platform: process.platform,
          arch: os.arch(),
          uptime: process.uptime(),
          memory: {
            total: os.totalmem(),
            free: os.freemem(),
          },
          cpus: os.cpus().length,
          configDir: storage.root,
        },
      },
    };
  });

  fastify.get("/storage", async () => ({
    root: storage.root,
    paths: {
      prompts: storage.prompts,
      config: storage.config,
      data: storage.data,
      auth: storage.auth,
      logs: storage.logs,
      database: storage.database,
      workflows: storage.workflows,
      providers: storage.providers,
      mcp: storage.mcp,
      skills: storage.skills,
    },
    sizes: {
      prompts: getDirSize(storage.prompts),
      config: getDirSize(storage.config),
      data: getDirSize(storage.data),
      auth: getDirSize(storage.auth),
      logs: getDirSize(storage.logs),
      database: getDirSize(storage.database),
      workflows: getDirSize(storage.workflows),
      providers: getDirSize(storage.providers),
      mcp: getDirSize(storage.mcp),
      skills: getDirSize(storage.skills),
    },
  }));
}

export { VERSION as systemVersion };
