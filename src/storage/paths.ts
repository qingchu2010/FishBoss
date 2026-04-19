import os from "node:os";
import path from "node:path";
import { StorageDirs, type StorageDir } from "./dirs.js";

export interface StoragePaths {
  root: string;
  prompts: string;
  config: string;
  data: string;
  auth: string;
  logs: string;
  database: string;
  workflows: string;
  providers: string;
  mcp: string;
  skills: string;
  platforms: string;
}

const DEFAULT_ROOT = ".fishboss";

function getHomeDir(): string {
  return os.homedir();
}

function resolveRootDir(homeDir: string, rootDir: string): string {
  return path.isAbsolute(rootDir) ? rootDir : path.join(homeDir, rootDir);
}

function resolveDir(
  homeDir: string,
  rootDir: string,
  subDir: StorageDir,
): string {
  return path.join(resolveRootDir(homeDir, rootDir), subDir);
}

export function createStoragePaths(customRoot?: string): StoragePaths {
  const homeDir = getHomeDir();
  const rootDir = customRoot || DEFAULT_ROOT;
  const resolvedRoot = resolveRootDir(homeDir, rootDir);

  return {
    root: resolvedRoot,
    prompts: resolveDir(homeDir, rootDir, StorageDirs.PROMPTS),
    config: resolveDir(homeDir, rootDir, StorageDirs.CONFIG),
    data: resolveDir(homeDir, rootDir, StorageDirs.DATA),
    auth: resolveDir(homeDir, rootDir, StorageDirs.AUTH),
    logs: resolveDir(homeDir, rootDir, StorageDirs.LOGS),
    database: resolveDir(homeDir, rootDir, StorageDirs.DATABASE),
    workflows: resolveDir(homeDir, rootDir, StorageDirs.WORKFLOWS),
    providers: resolveDir(homeDir, rootDir, StorageDirs.PROVIDERS),
    mcp: resolveDir(homeDir, rootDir, StorageDirs.MCP),
    skills: resolveDir(homeDir, rootDir, StorageDirs.SKILLS),
    platforms: resolveDir(homeDir, rootDir, StorageDirs.PLATFORMS),
  };
}

export function getStoragePaths(): StoragePaths {
  const rootEnv = process.env.FISHBOSS_ROOT;
  const rootDir = rootEnv ? rootEnv.replace(/^~/, getHomeDir()) : undefined;
  return createStoragePaths(rootDir);
}

export { StorageDirs };
