import type { ProviderToolDefinition, ProviderUsage } from "../../../types/provider.js";
import type { ToolDefinition, ToolResult } from "../tools/index.js";
import type { ConversationSchema, MessageSchema } from "./schemas.js";
import {
  TOOL_CALL_CLOSE_TAG,
  TOOL_CALL_OPEN_TAG,
  type ParsedToolCall,
} from "./assistant-turn-parser.js";
import { getLogger } from "../../logging/index.js";

const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_RESULT_PREVIEW_LENGTH = 4_000;
const MAX_TOOL_RESULT_LINES = 80;
const DEFAULT_MAX_TOOL_LOOP_ITERATIONS = 8;
export const MAX_TOOL_LOOP_ITERATIONS_LIMIT = 32;
const HOST_PLATFORM =
  process.platform === "win32"
    ? "Windows"
    : process.platform === "darwin"
      ? "macOS"
      : "Linux";
const logger = getLogger();

export type ConversationToolProtocol = "native" | "text";

export interface ProviderChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function isChatConsoleConversation(
  conversation: ConversationSchema,
): boolean {
  const metadata = conversation.metadata;
  if (
    metadata?.conversationClass &&
    metadata.conversationClass !== "chat-console"
  ) {
    return false;
  }
  if (
    metadata?.platformId ||
    metadata?.platformType ||
    metadata?.externalThreadId
  ) {
    return false;
  }
  return !metadata?.tags?.some((tag) => tag.startsWith("platform:"));
}

export function mergeUsage(
  current: ProviderUsage | undefined,
  incoming: ProviderUsage | undefined,
): ProviderUsage | undefined {
  if (!incoming) {
    return current;
  }

  const merged: ProviderUsage = {
    promptTokens: incoming.promptTokens ?? current?.promptTokens,
    completionTokens: incoming.completionTokens ?? current?.completionTokens,
    totalTokens: incoming.totalTokens ?? current?.totalTokens,
  };

  if (
    merged.promptTokens === undefined &&
    merged.completionTokens === undefined &&
    merged.totalTokens === undefined
  ) {
    return undefined;
  }

  return merged;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function mergeAssistantText(
  base: string | undefined,
  next: string | undefined,
): string | undefined {
  const left = base ?? "";
  const right = next ?? "";

  if (!left && !right) {
    return undefined;
  }

  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  if (/\s$/.test(left) || /^\s/.test(right)) {
    return `${left}${right}`;
  }

  return `${left}\n\n${right}`;
}

export function normalizeToolNameList(tools?: string[]): string[] {
  if (!tools || tools.length === 0) {
    return [];
  }

  return Array.from(
    new Set(tools.map((tool) => tool.trim()).filter((tool) => tool.length > 0)),
  );
}

export function resolveMaxToolLoopIterations(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_TOOL_LOOP_ITERATIONS_LIMIT
  ) {
    return value;
  }

  return DEFAULT_MAX_TOOL_LOOP_ITERATIONS;
}

export function toProviderToolDefinitions(
  toolDefinitions: ToolDefinition[],
): ProviderToolDefinition[] {
  return toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export function isModelVisibleTool(toolDefinition: ToolDefinition): boolean {
  return toolDefinition.modelVisible !== false;
}

export function resolveConversationToolProtocol(provider: {
  type: "openai" | "anthropic" | "ollama" | "custom";
  protocol?: "openai" | "anthropic" | "ollama" | "generic";
}): ConversationToolProtocol {
  if (provider.protocol === "ollama" || provider.type === "ollama") {
    return "text";
  }

  return "native";
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    logger.warn("Failed to stringify conversation message value", {
      error: String(_error),
    });
    return JSON.stringify({ value: String(value) }, null, 2);
  }
}

function truncateByLines(value: string, maxLines: number): string {
  const lines = value.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return value;
  }
  return `${lines.slice(0, maxLines).join("\n")}\n... [truncated ${lines.length - maxLines} more lines]`;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n... [truncated ${value.length - maxLength} more chars]`;
}

function formatBoundedJson(value: unknown): string {
  return truncateText(
    truncateByLines(safeJsonStringify(value), MAX_TOOL_RESULT_LINES),
    MAX_TOOL_RESULT_PREVIEW_LENGTH,
  );
}

function buildNoToolsInstructions(): string {
  return [
    "No tools are available in this chat.",
    "",
    "Rules:",
    "- Do not emit tool-call blocks.",
    "- Do not pretend any tool or external action was executed.",
    "- Do not mention system prompts, internal settings, permissions, policies, or configuration.",
    "- If the user asks what tools are available, reply briefly that no tools are available in this chat.",
    "- If the user asks for work that depends on unavailable tools, say you cannot perform that action here and offer the best direct answer you can without tools.",
    "- Keep the explanation brief and move on to helping with the request.",
  ].join("\n");
}

function buildSharedToolRules(): string[] {
  return [
    "- Only call allowed tools listed below.",
    "- For file_read, file_write, and file_edit, always include the required path fields inside input.",
    "- Do not say you will inspect, search, read, edit, open, run, grep, or check something unless the same response also calls the tool.",
    "- If a tool result returns an error but the task can still continue with the available tools, immediately make the next tool call in the next assistant turn instead of stopping at narration or asking the user to continue.",
    "- If file_edit fails because text was not found, inspect the file again with file_read, grep, or glob before attempting another edit.",
    "- When the user asks to create, modify, run, or open local files, complete the full tool workflow end-to-end whenever the needed tools are available.",
    ...(HOST_PLATFORM === "Windows"
      ? [
          "- For shell commands on Windows, prefer cmd or PowerShell syntax such as dir, Get-ChildItem, or powershell -Command instead of ls unless the environment clearly provides Unix shell utilities.",
        ]
      : []),
    "- After tool results are returned, continue the task using those results and give a normal assistant answer when done.",
  ];
}

function buildNativeToolProtocolInstructions(): string[] {
  return [
    "### Tool calling protocol",
    "",
    "Use the provider's native tool calling interface for tool calls.",
    "",
    "Rules:",
    "- Do not write JSON tool-call blocks in assistant text.",
    `- Do not emit ${TOOL_CALL_OPEN_TAG}...${TOOL_CALL_CLOSE_TAG} or [TOOL_CALL]...[/TOOL_CALL] text.`,
    ...buildSharedToolRules(),
  ];
}

function buildTextToolProtocolInstructions(): string[] {
  return [
    "### Tool calling protocol",
    "",
    "When using a tool, respond with optional normal-language context followed by one or more strict tool-call blocks in exactly this format:",
    TOOL_CALL_OPEN_TAG,
    '{"name":"tool_name","input":{"key":"value"}}',
    TOOL_CALL_CLOSE_TAG,
    "",
    "Rules:",
    "- Emit valid JSON only inside each tool-call block.",
    '- Use exactly one object per block with keys "name" and "input".',
    "- Never mention or request tools outside this block format.",
    "- Do not emit legacy formats such as [TOOL_CALL]...[/TOOL_CALL], tool => ..., args => ..., XML namespaces, or assistant tool-call summaries.",
    ...buildSharedToolRules(),
  ];
}

export function buildToolInstructions(
  toolDefinitions: ToolDefinition[],
  toolProtocol: ConversationToolProtocol,
): string {
  if (toolDefinitions.length === 0) {
    return buildNoToolsInstructions();
  }

  const toolLines = toolDefinitions
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  Input schema: ${safeJsonStringify(tool.inputSchema)}`,
    )
    .join("\n");

  return [
    "## Work Code (FishBoss)",
    "",
    "You are FishBoss, a practical coding agent working inside a local workspace.",
    `Host platform: ${HOST_PLATFORM}.`,
    "",
    "### Core rules (priority order)",
    "",
    "1. Tool preference: prefer the allowed tools below over purely guessing or claiming actions were taken.",
    "2. Honesty: never pretend a tool was executed if it was not actually called.",
    "3. Efficiency and batching: use tools when they materially improve correctness, and when multiple independent tool calls are needed, batch them when possible.",
    "4. Safety and boundaries: use only the allowed tools listed below. If a task requires unavailable capabilities, explain the limitation plainly.",
    "",
    ...(toolProtocol === "native"
      ? buildNativeToolProtocolInstructions()
      : buildTextToolProtocolInstructions()),
    "",
    "Allowed tools:",
    toolLines,
  ].join("\n");
}

function formatAssistantToolCallMessage(message: MessageSchema): string {
  return message.content.trim();
}

function formatToolMessageForProvider(message: MessageSchema): string {
  const baseContent = message.content.trim();
  return ["[tool result]", baseContent]
    .filter((part) => part.length > 0)
    .join("\n");
}

export function buildConversationHistory(
  messages: MessageSchema[],
): ProviderChatMessage[] {
  const chatMessages: ProviderChatMessage[] = [];

  for (const message of messages.slice(-MAX_HISTORY_MESSAGES)) {
    if (message.role === "system" || message.role === "user") {
      chatMessages.push({
        role: message.role,
        content: message.content ?? "",
      });
      continue;
    }

    if (message.role === "assistant") {
      const content = formatAssistantToolCallMessage(message);
      if (content.length > 0) {
        chatMessages.push({
          role: "assistant",
          content,
        });
      }
      continue;
    }

    if (message.role === "tool") {
      chatMessages.push({
        role: "user",
        content: formatToolMessageForProvider(message),
      });
    }
  }

  return chatMessages;
}

export function buildEffectiveMessages(args: {
  messages: MessageSchema[];
  toolDefinitions: ToolDefinition[];
  toolProtocol: ConversationToolProtocol;
  agentInstructions?: string;
}): ProviderChatMessage[] {
  const systemParts: string[] = [];

  if (args.agentInstructions && args.agentInstructions.trim().length > 0) {
    systemParts.push(args.agentInstructions.trim());
  }

  systemParts.push(
    buildToolInstructions(args.toolDefinitions, args.toolProtocol),
  );

  const historyMessages = buildConversationHistory(args.messages);
  const effectiveMessages: ProviderChatMessage[] = [];

  if (systemParts.length > 0) {
    effectiveMessages.push({
      role: "system",
      content: systemParts.join("\n\n"),
    });
  }

  for (const message of historyMessages) {
    effectiveMessages.push(message);
  }

  return effectiveMessages;
}

export function buildToolMessageContent(
  toolCall: ParsedToolCall,
  result: ToolResult,
): string {
  const statusLine = result.error ? "status: error" : "status: success";
  const errorLine = result.error ? `error: ${result.error}` : undefined;
  const outputLine =
    result.output !== undefined
      ? `output:\n${formatBoundedJson(result.output)}`
      : undefined;

  return [
    `Tool ${toolCall.name} completed for call ${toolCall.id}.`,
    statusLine,
    errorLine,
    outputLine,
  ]
    .filter(
      (line): line is string => typeof line === "string" && line.length > 0,
    )
    .join("\n");
}
