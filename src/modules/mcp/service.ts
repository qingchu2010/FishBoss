import type { MCPServer, MCPTool, MCPResource } from '../../types/mcp.js';
import type { MCPToolCallRequest } from './schema.js';
import { MCPServerRepository, MCPToolRepository, MCPResourceRepository } from './repository.js';
import {
  CreateMCPServerSchema,
  UpdateMCPServerSchema,
  toMCPServerResponse,
  toMCPToolResponse,
  toMCPResourceResponse,
  type MCPServerResponse,
  type MCPToolResponse,
  type MCPResourceResponse,
  type MCPToolCallResponse,
} from './schema.js';

type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export class MCPService {
  private serverRepository: MCPServerRepository;
  private toolRepository: MCPToolRepository;
  private resourceRepository: MCPResourceRepository;
  private serverStatuses: Map<string, ServerStatus>;
  private serverProcesses: Map<string, { kill: () => void }>;

  constructor(
    serverRepository?: MCPServerRepository,
    toolRepository?: MCPToolRepository,
    resourceRepository?: MCPResourceRepository
  ) {
    this.serverRepository = serverRepository ?? new MCPServerRepository();
    this.toolRepository = toolRepository ?? new MCPToolRepository();
    this.resourceRepository = resourceRepository ?? new MCPResourceRepository();
    this.serverStatuses = new Map();
    this.serverProcesses = new Map();
  }

  async listServers(): Promise<MCPServerResponse[]> {
    const servers = await this.serverRepository.list();
    return servers.map(s => toMCPServerResponse(s, this.serverStatuses.get(s.id) ?? 'stopped'));
  }

  async getServer(id: string): Promise<MCPServerResponse | null> {
    const server = await this.serverRepository.get(id);
    if (!server) return null;
    return toMCPServerResponse(server, this.serverStatuses.get(id) ?? 'stopped');
  }

  async createServer(data: unknown): Promise<MCPServerResponse> {
    const parsed = CreateMCPServerSchema.parse(data);
    const server = await this.serverRepository.create({
      name: parsed.name,
      command: parsed.command,
      args: parsed.args,
      env: parsed.env,
      enabled: parsed.enabled,
    });
    return toMCPServerResponse(server, 'stopped');
  }

  async updateServer(id: string, data: unknown): Promise<MCPServerResponse | null> {
    const parsed = UpdateMCPServerSchema.parse(data);
    const server = await this.serverRepository.update(id, {
      name: parsed.name,
      command: parsed.command,
      args: parsed.args,
      env: parsed.env,
      enabled: parsed.enabled,
    });
    if (!server) return null;
    return toMCPServerResponse(server, this.serverStatuses.get(id) ?? 'stopped');
  }

  async deleteServer(id: string): Promise<boolean> {
    await this.stopServer(id);
    return this.serverRepository.delete(id);
  }

  async installServer(id: string): Promise<{ success: boolean; message: string }> {
    const server = await this.serverRepository.get(id);
    if (!server) {
      return { success: false, message: 'Server not found' };
    }
    return {
      success: true,
      message: `Installation placeholder: Would install ${server.name} via "${server.command} ${server.args.join(' ')}"`,
    };
  }

  async startServer(id: string): Promise<{ success: boolean; error?: string }> {
    const server = await this.serverRepository.get(id);
    if (!server) {
      return { success: false, error: 'Server not found' };
    }

    if (!server.enabled) {
      return { success: false, error: 'Server is disabled' };
    }

    const currentStatus = this.serverStatuses.get(id);
    if (currentStatus === 'running' || currentStatus === 'starting') {
      return { success: false, error: 'Server is already running or starting' };
    }

    this.serverStatuses.set(id, 'starting');

    try {
      const mockProcess = { kill: () => this.serverStatuses.set(id, 'stopped') };
      this.serverProcesses.set(id, mockProcess);

      const tools = await this.discoverTools(server);
      await this.toolRepository.saveTools(id, tools);

      const resources = await this.discoverResources(server);
      await this.resourceRepository.saveResources(id, resources);

      this.serverStatuses.set(id, 'running');
      return { success: true };
    } catch (err) {
      this.serverStatuses.set(id, 'error');
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async stopServer(id: string): Promise<{ success: boolean; error?: string }> {
    const server = await this.serverRepository.get(id);
    if (!server) {
      return { success: false, error: 'Server not found' };
    }

    const currentStatus = this.serverStatuses.get(id);
    if (currentStatus === 'stopped' || currentStatus === 'stopping') {
      return { success: false, error: 'Server is already stopped or stopping' };
    }

    this.serverStatuses.set(id, 'stopping');

    try {
      const process = this.serverProcesses.get(id);
      if (process) {
        process.kill();
        this.serverProcesses.delete(id);
      }
      await this.toolRepository.clearTools(id);
      await this.resourceRepository.clearResources(id);
      this.serverStatuses.set(id, 'stopped');
      return { success: true };
    } catch (err) {
      this.serverStatuses.set(id, 'error');
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async restartServer(id: string): Promise<{ success: boolean; error?: string }> {
    const stopResult = await this.stopServer(id);
    if (!stopResult.success) {
      return stopResult;
    }
    return this.startServer(id);
  }

  async listTools(serverId: string): Promise<MCPToolResponse[]> {
    const tools = await this.toolRepository.listByServer(serverId);
    return tools.map(toMCPToolResponse);
  }

  async listAllTools(): Promise<MCPToolResponse[]> {
    const servers = await this.serverRepository.list();
    const allTools: MCPToolResponse[] = [];
    for (const server of servers) {
      if (this.serverStatuses.get(server.id) === 'running') {
        const tools = await this.toolRepository.listByServer(server.id);
        allTools.push(...tools.map(toMCPToolResponse));
      }
    }
    return allTools;
  }

  async callTool(serverId: string, request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    const status = this.serverStatuses.get(serverId);
    if (status !== 'running') {
      return { success: false, error: `Server is not running (status: ${status ?? 'unknown'})` };
    }

    try {
      return {
        success: true,
        result: { placeholder: true, message: `Would call ${request.toolName} with ${JSON.stringify(request.arguments ?? {})}` },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async listResources(serverId: string): Promise<MCPResourceResponse[]> {
    const resources = await this.resourceRepository.listByServer(serverId);
    return resources.map(toMCPResourceResponse);
  }

  async readResource(uri: string): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      return {
        success: true,
        content: `Placeholder resource content for: ${uri}`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async discoverTools(server: MCPServer): Promise<Omit<MCPTool, 'serverId'>[]> {
    return [
      { name: `${server.name}-tool`, description: `Tool from ${server.name}`, inputSchema: {} },
    ];
  }

  private async discoverResources(server: MCPServer): Promise<Omit<MCPResource, 'serverId'>[]> {
    return [
      { uri: `file:///tmp/${server.name}`, name: `${server.name} resource`, mimeType: 'text/plain' },
    ];
  }
}
