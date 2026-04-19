export interface MCPServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
  serverId: string;
}
