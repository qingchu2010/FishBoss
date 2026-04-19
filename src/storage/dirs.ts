export const StorageDirs = {
  PROMPTS: "prompts",
  CONFIG: "config",
  DATA: "data",
  AUTH: "auth",
  LOGS: "logs",
  DATABASE: "database",
  WORKFLOWS: "workflows",
  PROVIDERS: "providers",
  MCP: "mcp",
  SKILLS: "skills",
  PLATFORMS: "platforms",
} as const;

export type StorageDir = (typeof StorageDirs)[keyof typeof StorageDirs];
