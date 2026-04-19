export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  handler: string;
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ToolResult {
  callId: string;
  output?: unknown;
  error?: string;
}
