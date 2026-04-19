import { z } from "zod";

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()).optional(),
  category: z.string().optional(),
  modelVisible: z.boolean().optional(),
});

export const ToolCallSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  input: z.record(z.unknown()),
});

export const ToolResultSchema = z.object({
  callId: z.string(),
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;

export type ToolPlatform = "windows" | "macos" | "linux";

export interface ToolExecutionContext {
  workingDirectory?: string;
  allowPathsOutsideWorkspace?: boolean;
  platform?: ToolPlatform;
  environment?: Record<string, string>;
  conversationId?: string;
  messageId?: string;
  userId?: string;
}

export interface ResolvedToolExecutionContext extends ToolExecutionContext {
  workingDirectory: string;
  allowPathsOutsideWorkspace: boolean;
  platform: ToolPlatform;
  environment: Record<string, string>;
}

export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  callId: string,
) => Promise<ToolResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export interface RuntimeTool<TInput extends Record<string, unknown>, TOutput> {
  definition: ToolDefinition;
  validate(input: Record<string, unknown>): TInput;
  execute(
    input: TInput,
    context: ResolvedToolExecutionContext,
  ): Promise<TOutput>;
}
