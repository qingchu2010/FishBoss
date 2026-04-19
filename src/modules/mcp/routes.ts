import type { MCPServerResponse, MCPToolResponse, MCPResourceResponse, MCPToolCallResponse } from './schema.js';
import { MCPService } from './service.js';

export interface MCPRoutes {
  listServers(): Promise<MCPServerResponse[]>;
  getServer(id: string): Promise<MCPServerResponse | null>;
  createServer(data: unknown): Promise<MCPServerResponse>;
  updateServer(id: string, data: unknown): Promise<MCPServerResponse | null>;
  deleteServer(id: string): Promise<boolean>;
  installServer(id: string): Promise<{ success: boolean; message: string }>;
  startServer(id: string): Promise<{ success: boolean; error?: string }>;
  stopServer(id: string): Promise<{ success: boolean; error?: string }>;
  restartServer(id: string): Promise<{ success: boolean; error?: string }>;
  listTools(serverId: string): Promise<MCPToolResponse[]>;
  listAllTools(): Promise<MCPToolResponse[]>;
  callTool(serverId: string, request: unknown): Promise<MCPToolCallResponse>;
  listResources(serverId: string): Promise<MCPResourceResponse[]>;
  readResource(uri: string): Promise<{ success: boolean; content?: string; error?: string }>;
}

export function createMCPRoutes(service?: MCPService): MCPRoutes {
  const svc = service ?? new MCPService();

  return {
    listServers: () => svc.listServers(),
    getServer: (id) => svc.getServer(id),
    createServer: (data) => svc.createServer(data),
    updateServer: (id, data) => svc.updateServer(id, data),
    deleteServer: (id) => svc.deleteServer(id),
    installServer: (id) => svc.installServer(id),
    startServer: (id) => svc.startServer(id),
    stopServer: (id) => svc.stopServer(id),
    restartServer: (id) => svc.restartServer(id),
    listTools: (serverId) => svc.listTools(serverId),
    listAllTools: () => svc.listAllTools(),
    callTool: (serverId, request) => svc.callTool(serverId, request as Parameters<typeof svc.callTool>[1]),
    listResources: (serverId) => svc.listResources(serverId),
    readResource: (uri) => svc.readResource(uri),
  };
}
