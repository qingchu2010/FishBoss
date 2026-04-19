import { getLogger } from "../../logging/index.js";
import { buildTool } from "./ToolBuilder.js";
import { AgentTool } from "./tools/AgentTool.js";
import { AskUserQuestionTool } from "./tools/AskUserQuestionTool.js";
import { BashTool } from "./tools/BashTool.js";
import { FileEditTool } from "./tools/FileEditTool.js";
import { FileReadTool } from "./tools/FileReadTool.js";
import { FileWriteTool } from "./tools/FileWriteTool.js";
import { GlobTool } from "./tools/GlobTool.js";
import { GrepTool } from "./tools/GrepTool.js";
import { NotebookEditTool } from "./tools/NotebookEditTool.js";
import { SkillTool } from "./tools/SkillTool.js";
import { TodoWriteTool } from "./tools/TodoWriteTool.js";
import { ToolSearchTool } from "./tools/ToolSearchTool.js";
import { WebFetchTool } from "./tools/WebFetchTool.js";
import { WebSearchTool } from "./tools/WebSearchTool.js";
import {
  ToolCallSchema,
  ToolDefinitionSchema,
  ToolResultSchema,
  type RegisteredTool,
  type RuntimeTool,
  type ToolCall,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolHandler,
  type ToolResult,
  type ToolPlatform,
  type ResolvedToolExecutionContext,
} from "./types.js";

const logger = getLogger();

function resolvePlatform(platform: NodeJS.Platform): ToolPlatform {
  if (platform === "win32") {
    return "windows";
  }

  if (platform === "darwin") {
    return "macos";
  }

  return "linux";
}

function resolveExecutionContext(
  context: ToolExecutionContext = {},
): ResolvedToolExecutionContext {
  return {
    ...context,
    workingDirectory: context.workingDirectory ?? process.cwd(),
    allowPathsOutsideWorkspace: context.allowPathsOutsideWorkspace ?? false,
    platform: context.platform ?? resolvePlatform(process.platform),
    environment: context.environment ?? {},
  };
}

function createToolHandler<TInput extends Record<string, unknown>, TOutput>(
  tool: RuntimeTool<TInput, TOutput>,
): ToolHandler {
  return async (input, context, callId) => {
    const resolvedContext = resolveExecutionContext(context);
    const validatedInput = tool.validate(input);
    const output = await tool.execute(validatedInput, resolvedContext);
    return { callId, output };
  };
}

function registerDefaultTools(registry: ToolRegistry): void {
  registry.register(FileReadTool.definition, createToolHandler(FileReadTool));
  registry.register(FileEditTool.definition, createToolHandler(FileEditTool));
  registry.register(FileWriteTool.definition, createToolHandler(FileWriteTool));
  registry.register(NotebookEditTool.definition, createToolHandler(NotebookEditTool));
  registry.register(GlobTool.definition, createToolHandler(GlobTool));
  registry.register(GrepTool.definition, createToolHandler(GrepTool));
  registry.register(ToolSearchTool.definition, createToolHandler(ToolSearchTool));
  registry.register(BashTool.definition, createToolHandler(BashTool));
  registry.register(WebFetchTool.definition, createToolHandler(WebFetchTool));
  registry.register(WebSearchTool.definition, createToolHandler(WebSearchTool));
  registry.register(TodoWriteTool.definition, createToolHandler(TodoWriteTool));
  registry.register(SkillTool.definition, createToolHandler(SkillTool));
  registry.register(AskUserQuestionTool.definition, createToolHandler(AskUserQuestionTool));
  registry.register(AgentTool.definition, createToolHandler(AgentTool));
}

export {
  AgentTool,
  AskUserQuestionTool,
  ToolCallSchema,
  ToolDefinitionSchema,
  ToolResultSchema,
  FileWriteTool,
  GlobTool,
  GrepTool,
  NotebookEditTool,
  SkillTool,
  TodoWriteTool,
  ToolSearchTool,
  WebFetchTool,
  WebSearchTool,
  buildTool,
  BashTool,
  FileEditTool,
  FileReadTool,
};
export type {
  RegisteredTool,
  RuntimeTool,
  ResolvedToolExecutionContext,
  ToolCall,
  ToolDefinition,
  ToolExecutionContext,
  ToolHandler,
  ToolPlatform,
  ToolResult,
};

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool '${definition.name}' is already registered`);
    }
    this.tools.set(definition.name, { definition, handler });
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(
    call: ToolCall,
    context: ToolExecutionContext = {},
  ): Promise<ToolResult> {
    const parsedCall = ToolCallSchema.parse(call);
    const tool = this.tools.get(call.toolName);
    if (!tool) {
      return {
        callId: parsedCall.id,
        error: `Tool '${parsedCall.toolName}' not found`,
      };
    }

    try {
      return ToolResultSchema.parse(
        await tool.handler(parsedCall.input, context, parsedCall.id),
      );
    } catch (error) {
      logger.error("Tool execution failed", error, {
        toolName: parsedCall.toolName,
        conversationId: context.conversationId,
        messageId: context.messageId,
        userId: context.userId,
      });
      return {
        callId: parsedCall.id,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async executeBatch(
    calls: ToolCall[],
    context: ToolExecutionContext = {},
  ): Promise<ToolResult[]> {
    return Promise.all(calls.map((call) => this.execute(call, context)));
  }
}

let globalRegistry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
    registerDefaultTools(globalRegistry);
  }
  return globalRegistry;
}
