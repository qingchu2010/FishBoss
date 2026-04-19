import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PROJECT_ROOT = resolve(__dirname, "../../..");
export const SRC_DIR = resolve(PROJECT_ROOT, "src");
export const DIST_DIR = resolve(PROJECT_ROOT, "dist");

export const FISHBOSS_DIR = resolve(homedir(), ".fishboss");
export const CONFIG_DIR = resolve(FISHBOSS_DIR, "config");
export const DATA_DIR = resolve(FISHBOSS_DIR, "data");
export const LOGS_DIR = resolve(FISHBOSS_DIR, "logs");
export const CACHE_DIR = resolve(FISHBOSS_DIR, "cache");
export const TMP_DIR = resolve(FISHBOSS_DIR, "tmp");
export const AUTH_DIR = resolve(FISHBOSS_DIR, "auth");
export const DATABASE_DIR = resolve(FISHBOSS_DIR, "database");
export const PROMPTS_DIR = resolve(FISHBOSS_DIR, "prompts");
export const FRONTEND_CONFIG_DIR = resolve(FISHBOSS_DIR, "frontend-config");

export type TrustProxyValue = boolean | string | string[] | number;

export function parseTrustProxy(raw: string | undefined): TrustProxyValue {
  if (!raw || raw === "false") return false;
  if (raw === "true" || raw === "loopback") return "loopback";
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  if (raw.includes(",")) return raw.split(",").map((s) => s.trim());
  return raw;
}

export interface AppConfig {
  server: {
    host: string;
    port: number;
    secret: string;
    env: "development" | "production" | "test";
    trustProxy: TrustProxyValue;
  };
  rateLimit: {
    enabled: boolean;
    max: number;
    timeWindow: number;
  };
  cors: {
    origins: string[];
    credentials: boolean;
  };
}

let configCache: AppConfig | null = null;

export function ensureFishbossDirs(): void {
  const dirs = [
    FISHBOSS_DIR,
    CONFIG_DIR,
    DATA_DIR,
    LOGS_DIR,
    CACHE_DIR,
    TMP_DIR,
    AUTH_DIR,
    DATABASE_DIR,
    PROMPTS_DIR,
    FRONTEND_CONFIG_DIR,
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export function loadConfig(): AppConfig {
  if (configCache) {
    return configCache;
  }
  configCache = {
    server: {
      host: process.env["HOST"] ?? "0.0.0.0",
      port: parseInt(process.env["PORT"] ?? "6577", 10),
      secret: process.env["SERVER_SECRET"] ?? "",
      env: (process.env["NODE_ENV"] ??
        "development") as AppConfig["server"]["env"],
      trustProxy: parseTrustProxy(process.env["TRUST_PROXY"]),
    },
    rateLimit: {
      enabled: process.env["RATE_LIMIT_ENABLED"] !== "false",
      max: parseInt(process.env["RATE_LIMIT_MAX"] ?? "100", 10),
      timeWindow: parseInt(process.env["RATE_LIMIT_WINDOW_MS"] ?? "60000", 10),
    },
    cors: {
      origins: (
        process.env["CORS_ORIGINS"] ??
        "http://localhost:3000,http://localhost:5173,http://localhost:6500"
      ).split(","),
      credentials: true,
    },
  };
  return configCache;
}

export function resetConfig(): void {
  configCache = null;
}

export function getSecret(): string {
  const cfg = loadConfig();
  if (!cfg.server.secret) {
    throw new Error("SERVER_SECRET environment variable is required");
  }
  return cfg.server.secret;
}

export function isDevelopment(): boolean {
  return loadConfig().server.env === "development";
}

export function isProduction(): boolean {
  return loadConfig().server.env === "production";
}

export function isTest(): boolean {
  return loadConfig().server.env === "test";
}
