import type { MCPServer, MCPTool, MCPResource } from '../../types/mcp.js';

export interface MCPServerStore {
  list(): Promise<MCPServer[]>;
  get(id: string): Promise<MCPServer | null>;
  create(data: Partial<MCPServer>): Promise<MCPServer>;
  update(id: string, data: Partial<MCPServer>): Promise<MCPServer>;
  delete(id: string): Promise<void>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
}

export interface MCPToolStore {
  listByServer(serverId: string): Promise<MCPTool[]>;
  call(serverId: string, toolName: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface MCPResourceStore {
  listByServer(serverId: string): Promise<MCPResource[]>;
  read(uri: string): Promise<string>;
}

export { MCPService } from './service.js';
export { createMCPRoutes, type MCPRoutes } from './routes.js';
export { MCPServerRepository, MCPToolRepository, MCPResourceRepository } from './repository.js';
export * from './schema.js';
