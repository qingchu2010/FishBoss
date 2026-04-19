import { z } from 'zod';
import type { MCPServer, MCPTool, MCPResource } from '../../types/mcp.js';

export const MCPServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  env: z.record(z.string()),
  enabled: z.boolean(),
});

export type MCPServerInput = z.infer<typeof MCPServerSchema>;

export const CreateMCPServerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  command: z.string().min(1, 'Command is required'),
  args: z.array(z.string()),
  env: z.record(z.string()),
  enabled: z.boolean(),
});

export const UpdateMCPServerSchema = z.object({
  name: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export const MCPToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
  serverId: z.string().min(1),
});

export type MCPToolInput = z.infer<typeof MCPToolSchema>;

export const MCPResourceSchema = z.object({
  uri: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  serverId: z.string().min(1),
});

export type MCPResourceInput = z.infer<typeof MCPResourceSchema>;

export interface MCPServerResponse {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  error?: string;
}

export interface MCPToolResponse {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}

export interface MCPResourceResponse {
  uri: string;
  name: string;
  mimeType?: string;
  serverId: string;
}

export interface MCPToolCallRequest {
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface MCPToolCallResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

export function toMCPServerResponse(server: MCPServer, status: MCPServerResponse['status'] = 'stopped', error?: string): MCPServerResponse {
  return {
    id: server.id,
    name: server.name,
    command: server.command,
    args: server.args,
    env: server.env,
    enabled: server.enabled,
    status,
    error,
  };
}

export function toMCPToolResponse(tool: MCPTool): MCPToolResponse {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    serverId: tool.serverId,
  };
}

export function toMCPResourceResponse(resource: MCPResource): MCPResourceResponse {
  return {
    uri: resource.uri,
    name: resource.name,
    mimeType: resource.mimeType,
    serverId: resource.serverId,
  };
}
