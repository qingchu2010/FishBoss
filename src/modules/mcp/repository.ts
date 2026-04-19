import fs from 'node:fs/promises';
import path from 'node:path';
import { getStoragePaths } from '../../storage/paths.js';
import type { MCPServer, MCPTool, MCPResource } from '../../types/mcp.js';
import { resolveSafeJsonEntityPath } from '../../utils/path.js';
import { generateId } from '../../utils/string.js';

interface StoredMCPServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export class MCPServerRepository {
  private serversPath: string;

  constructor(customPath?: string) {
    const paths = customPath ? { mcp: customPath } : getStoragePaths();
    this.serversPath = path.join(paths.mcp, 'servers');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.serversPath, { recursive: true });
  }

  private getFilePath(id: string): string {
    return resolveSafeJsonEntityPath(this.serversPath, id, 'mcp server id');
  }

  async list(): Promise<MCPServer[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.serversPath);
    const servers: MCPServer[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(this.serversPath, file), 'utf-8');
        const data = JSON.parse(content) as StoredMCPServer;
        servers.push(this.deserializeServer(data));
      } catch {
        // Skip invalid files
      }
    }

    return servers.sort((a, b) => 
      (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
    );
  }

  async get(id: string): Promise<MCPServer | null> {
    const filePath = this.getFilePath(id);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.deserializeServer(JSON.parse(content));
    } catch {
      return null;
    }
  }

  async create(data: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    enabled: boolean;
  }): Promise<MCPServer> {
    await this.ensureDir();
    const now = new Date();
    const server: MCPServer = {
      id: generateId(),
      name: data.name,
      command: data.command,
      args: data.args,
      env: data.env,
      enabled: data.enabled,
    };

    await fs.writeFile(
      this.getFilePath(server.id),
      JSON.stringify(this.serializeServer(server, now), null, 2)
    );

    return server;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      command: string;
      args: string[];
      env: Record<string, string>;
      enabled: boolean;
    }>
  ): Promise<MCPServer | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: MCPServer = {
      ...existing,
      name: data.name ?? existing.name,
      command: data.command ?? existing.command,
      args: data.args ?? existing.args,
      env: data.env ?? existing.env,
      enabled: data.enabled ?? existing.enabled,
    };

    await fs.writeFile(
      this.getFilePath(id),
      JSON.stringify(this.serializeServer(updated, new Date()), null, 2)
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private serializeServer(server: MCPServer, date: Date): StoredMCPServer {
    return {
      id: server.id,
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env,
      enabled: server.enabled,
      createdAt: (server.createdAt ?? date).toISOString(),
      updatedAt: date.toISOString(),
    };
  }

  private deserializeServer(data: StoredMCPServer): MCPServer {
    return {
      id: data.id,
      name: data.name,
      command: data.command,
      args: data.args,
      env: data.env,
      enabled: data.enabled,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    } as MCPServer;
  }
}

export class MCPToolRepository {
  private toolsPath: string;

  constructor(customPath?: string) {
    const paths = customPath ? { mcp: customPath } : getStoragePaths();
    this.toolsPath = path.join(paths.mcp, 'tools');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.toolsPath, { recursive: true });
  }

  private getServerFilePath(serverId: string): string {
    return resolveSafeJsonEntityPath(this.toolsPath, serverId, 'mcp server id');
  }

  async listByServer(serverId: string): Promise<MCPTool[]> {
    await this.ensureDir();
    const filePath = this.getServerFilePath(serverId);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as MCPTool[];
      return data.map(t => ({ ...t, serverId }));
    } catch {
      return [];
    }
  }

  async saveTools(serverId: string, tools: Omit<MCPTool, 'serverId'>[]): Promise<MCPTool[]> {
    await this.ensureDir();
    const fullTools: MCPTool[] = tools.map(t => ({ ...t, serverId }));
    await fs.writeFile(
      this.getServerFilePath(serverId),
      JSON.stringify(fullTools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })), null, 2)
    );
    return fullTools;
  }

  async clearTools(serverId: string): Promise<void> {
    const filePath = this.getServerFilePath(serverId);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist
    }
  }
}

export class MCPResourceRepository {
  private resourcesPath: string;

  constructor(customPath?: string) {
    const paths = customPath ? { mcp: customPath } : getStoragePaths();
    this.resourcesPath = path.join(paths.mcp, 'resources');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.resourcesPath, { recursive: true });
  }

  private getServerFilePath(serverId: string): string {
    return resolveSafeJsonEntityPath(this.resourcesPath, serverId, 'mcp server id');
  }

  async listByServer(serverId: string): Promise<MCPResource[]> {
    await this.ensureDir();
    const filePath = this.getServerFilePath(serverId);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as MCPResource[];
      return data.map(r => ({ ...r, serverId }));
    } catch {
      return [];
    }
  }

  async saveResources(serverId: string, resources: Omit<MCPResource, 'serverId'>[]): Promise<MCPResource[]> {
    await this.ensureDir();
    const fullResources: MCPResource[] = resources.map(r => ({ ...r, serverId }));
    await fs.writeFile(
      this.getServerFilePath(serverId),
      JSON.stringify(fullResources.map(r => ({ uri: r.uri, name: r.name, mimeType: r.mimeType })), null, 2)
    );
    return fullResources;
  }

  async clearResources(serverId: string): Promise<void> {
    const filePath = this.getServerFilePath(serverId);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist
    }
  }
}
