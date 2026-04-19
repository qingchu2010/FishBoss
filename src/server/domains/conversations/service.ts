import { getConversationRepository } from "./repository.js";
import { getAgentRepository } from "../agents/repository.js";
import type {
  ConversationSchema,
  CreateConversationSchema,
  UpdateConversationSchema,
  MessageSchema,
  AppendMessageSchema,
} from "./schemas.js";
import { ProviderService } from "../../../modules/providers/service.js";
import type {
  ProviderUsage,
  ProviderToolDefinition,
  StreamChunk,
  StreamToolCallDelta,
} from "../../../types/provider.js";
import {
  getToolRegistry,
  type ToolDefinition,
  type ToolResult,
} from "../tools/index.js";
import { FrontendConfigRepository } from "../../../modules/frontend-config/repository.js";

export interface StreamingEvent {
  type:
    | "chunk"
    | "tool_call"
    | "tool_result"
    | "complete"
    | "error"
    | "assistant_message_created";
  data: unknown;
  conversationId: string;
  messageId?: string;
}

export type StreamingEventHandler = (event: StreamingEvent) => void;

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";
const TOOL_CALL_OPEN_TAG = "<tool_call>";
const TOOL_CALL_CLOSE_TAG = "</tool_call>";
const LEGACY_TOOL_CALL_OPEN_TAG = "[TOOL_CALL]";
const LEGACY_TOOL_CALL_CLOSE_TAG = "[/TOOL_CALL]";
const TOOL_CALL_TAG_PAIRS = [
  { open: TOOL_CALL_OPEN_TAG, close: TOOL_CALL_CLOSE_TAG },
  { open: LEGACY_TOOL_CALL_OPEN_TAG, close: LEGACY_TOOL_CALL_CLOSE_TAG },
] as const;
const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_RESULT_PREVIEW_LENGTH = 4_000;
const MAX_TOOL_RESULT_LINES = 80;
const DEFAULT_MAX_TOOL_LOOP_ITERATIONS = 8;
const MAX_TOOL_LOOP_ITERATIONS_LIMIT = 32;
const HOST_PLATFORM =
  process.platform === "win32"
    ? "Windows"
    : process.platform === "darwin"
      ? "macOS"
      : "Linux";

interface ProviderChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ParsedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AssistantTurnParseResult {
  content: string;
  thinking?: string;
  toolCalls: ParsedToolCall[];
}

interface NativeToolCallAccumulator {
  id: string;
  name: string;
  inputJson: string;
}

interface ExecutedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

interface ToolExecutionRecord {
  toolCall: ExecutedToolCall;
}

function mergeUsage(
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function stripTrailingPartialTag(value: string, tag: string): string {
  const maxLength = Math.min(value.length, tag.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (value.endsWith(tag.slice(0, length))) {
      return value.slice(0, -length);
    }
  }
  return value;
}

function stripTrailingPartialTags(value: string, tags: readonly string[]): string {
  return tags.reduce(
    (currentValue, tag) => stripTrailingPartialTag(currentValue, tag),
    value,
  );
}

function findFirstToolCallOpenTag(
  raw: string,
  startIndex: number,
): { index: number; open: string; close: string } | null {
  let match: { index: number; open: string; close: string } | null = null;

  for (const pair of TOOL_CALL_TAG_PAIRS) {
    const index = raw.indexOf(pair.open, startIndex);
    if (index === -1) {
      continue;
    }

    if (!match || index < match.index) {
      match = {
        index,
        open: pair.open,
        close: pair.close,
      };
    }
  }

  return match;
}

function findFirstToolCallCloseTag(
  raw: string,
  startIndex: number,
): { index: number; close: string } | null {
  let match: { index: number; close: string } | null = null;

  for (const pair of TOOL_CALL_TAG_PAIRS) {
    const index = raw.indexOf(pair.close, startIndex);
    if (index === -1) {
      continue;
    }

    if (!match || index < match.index) {
      match = {
        index,
        close: pair.close,
      };
    }
  }

  return match;
}

function normalizeToolCallTags(value: string): string {
  return TOOL_CALL_TAG_PAIRS.reduce((currentValue, pair) => {
    if (
      pair.open === TOOL_CALL_OPEN_TAG &&
      pair.close === TOOL_CALL_CLOSE_TAG
    ) {
      return currentValue;
    }

    return currentValue
      .split(pair.open)
      .join(TOOL_CALL_OPEN_TAG)
      .split(pair.close)
      .join(TOOL_CALL_CLOSE_TAG);
  }, value);
}

function parseLooseToolCallScalar(value: string): unknown {
  const trimmed = value.trim().replace(/,$/, "");

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (trimmed === "null") {
    return null;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

function parseLooseToolCallBlock(rawBlock: string): ParsedToolCall | null {
  const normalized = rawBlock
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\r/g, "")
    .trim();

  const toolMatch = normalized.match(
    /(?:^|[{,\s])(?:name|tool)\s*(?::|=>)\s*["']?([A-Za-z0-9_.-]+)["']?/i,
  );
  const argsMatch = normalized.match(/(?:input|args)\s*(?::|=>)\s*\{([\s\S]*)\}/i);

  if (!toolMatch || !argsMatch) {
    return null;
  }

  const input: Record<string, unknown> = {};
  const argLines = argsMatch[1]
    .split(/\r?\n|,/)
    .map((line) =>
      line
        .trim()
        .replace(/^[\s\-–—•]+/, "")
        .replace(/[{}]/g, "")
        .trim(),
    )
    .filter((line) => line.length > 0);

  for (const line of argLines) {
    const match = line.match(/^["']?([A-Za-z0-9_.-]+)["']?\s*(?::|=>)?\s*(.+)$/);
    if (!match) {
      continue;
    }
    input[match[1]] = parseLooseToolCallScalar(match[2]);
  }

  if (Object.keys(input).length === 0) {
    return null;
  }

  return {
    id: generateToolCallId(),
    name: toolMatch[1].trim(),
    input,
  };
}

interface ThinkingState {
  thinking: string;
  unclosed: boolean;
  toolCallUnclosed: boolean;
}

interface ParsedChunk {
  content: string;
  thinkingDelta: string | null;
  state: ThinkingState;
}

function parseChunk(raw: string, state: ThinkingState): ParsedChunk {
  let { thinking, unclosed, toolCallUnclosed } = state;
  let content = "";
  let index = 0;

  if (unclosed) {
    const closeIndex = raw.indexOf(THINK_CLOSE_TAG);
    if (closeIndex === -1) {
      thinking += stripTrailingPartialTag(raw, THINK_CLOSE_TAG);
      return {
        content: "",
        thinkingDelta: null,
        state: { thinking, unclosed: true, toolCallUnclosed },
      };
    }

    thinking += raw.slice(0, closeIndex);
    const newThinkingDelta = raw.slice(0, closeIndex);
    unclosed = false;
    index = closeIndex + THINK_CLOSE_TAG.length;

    if (index >= raw.length) {
      return {
        content,
        thinkingDelta: newThinkingDelta,
        state: { thinking, unclosed, toolCallUnclosed },
      };
    }
  }

  while (index < raw.length) {
    const openIndex = raw.indexOf(THINK_OPEN_TAG, index);
    if (openIndex === -1) {
      content += stripTrailingPartialTag(raw.slice(index), THINK_OPEN_TAG);
      break;
    }

    content += raw.slice(index, openIndex);

    const thinkStart = openIndex + THINK_OPEN_TAG.length;
    const closeIndex = raw.indexOf(THINK_CLOSE_TAG, thinkStart);
    if (closeIndex === -1) {
      thinking += stripTrailingPartialTag(
        raw.slice(thinkStart),
        THINK_CLOSE_TAG,
      );
      unclosed = true;
      break;
    }

    thinking += raw.slice(thinkStart, closeIndex);
    index = closeIndex + THINK_CLOSE_TAG.length;
  }

  const sanitizedContent = stripToolCallContent(content, toolCallUnclosed);
  toolCallUnclosed = sanitizedContent.toolCallUnclosed;

  return {
    content: sanitizedContent.content,
    thinkingDelta: null,
    state: { thinking, unclosed, toolCallUnclosed },
  };
}

function stripToolCallContent(
  raw: string,
  toolCallUnclosed: boolean,
): {
  content: string;
  toolCallUnclosed: boolean;
} {
  let content = "";
  let index = 0;

  if (toolCallUnclosed) {
    const closeMatch = findFirstToolCallCloseTag(raw, 0);
    if (!closeMatch) {
      return {
        content: "",
        toolCallUnclosed: true,
      };
    }

    index = closeMatch.index + closeMatch.close.length;
    toolCallUnclosed = false;
  }

  while (index < raw.length) {
    const openMatch = findFirstToolCallOpenTag(raw, index);
    if (!openMatch) {
      content += stripTrailingPartialTags(
        raw.slice(index),
        TOOL_CALL_TAG_PAIRS.map((pair) => pair.open),
      );
      break;
    }

    content += raw.slice(index, openMatch.index);

    const closeIndex = raw.indexOf(
      openMatch.close,
      openMatch.index + openMatch.open.length,
    );
    if (closeIndex === -1) {
      toolCallUnclosed = true;
      break;
    }

    index = closeIndex + openMatch.close.length;
  }

  return {
    content,
    toolCallUnclosed,
  };
}

function parseAssistantOutput(raw: string): {
  content: string;
  thinking?: string;
} {
  let content = "";
  let thinking = "";
  let index = 0;

  while (index < raw.length) {
    const openIndex = raw.indexOf(THINK_OPEN_TAG, index);
    if (openIndex === -1) {
      content += stripTrailingPartialTag(raw.slice(index), THINK_OPEN_TAG);
      break;
    }

    content += raw.slice(index, openIndex);

    const thinkStart = openIndex + THINK_OPEN_TAG.length;
    const closeIndex = raw.indexOf(THINK_CLOSE_TAG, thinkStart);
    if (closeIndex === -1) {
      thinking += stripTrailingPartialTag(
        raw.slice(thinkStart),
        THINK_CLOSE_TAG,
      );
      break;
    }

    thinking += raw.slice(thinkStart, closeIndex);
    index = closeIndex + THINK_CLOSE_TAG.length;
  }

  const normalizedThinking = thinking.trim();

  if (!normalizedThinking) {
    return {
      content,
    };
  }

  return {
    content: content.replace(/^\s+/, ""),
    thinking: normalizedThinking,
  };
}

function mergeAssistantText(
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

function generateToolCallId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
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

function normalizeToolNameList(tools?: string[]): string[] {
  if (!tools || tools.length === 0) {
    return [];
  }

  return Array.from(
    new Set(tools.map((tool) => tool.trim()).filter((tool) => tool.length > 0)),
  );
}

function resolveMaxToolLoopIterations(value: unknown): number {
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

function buildToolInstructions(toolDefinitions: ToolDefinition[]): string {
  if (toolDefinitions.length === 0) {
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
    ].join("\\n");
  }

  const toolLines = toolDefinitions
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\\n  Input schema: ${safeJsonStringify(tool.inputSchema)}`,
    )
    .join("\\n");

  return [
    "## Work Code (FishBoss)",
    "",
    "You are FishBoss, a practical coding agent working inside a local workspace.",
    `Host platform: ${HOST_PLATFORM}.`,
    "",
    "### Core rules (priority order)",
    "",
    "1. **Tool preference** – Prefer the allowed tools below over purely guessing or claiming actions were taken.",
    "2. **Honesty** – Never pretend a tool was executed if it was not actually called.",
    "3. **Efficiency & batching** – Use tools when they materially improve correctness, and when multiple independent tool calls are needed, batch them when possible.",
    "4. **Safety & boundaries** – Use only the allowed tools listed below. If a task requires unavailable capabilities, explain the limitation plainly.",
    "",
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
    "- Only call allowed tools listed below.",
    "- For file_read, file_write, and file_edit, always include the required path fields inside input.",
    "- Do not say you will inspect, search, read, edit, open, run, grep, or check something unless the same response also includes the actual tool-call block that does it.",
    "- If a tool result returns an error but the task can still continue with the available tools, immediately make the next tool call in the next assistant turn instead of stopping at narration or asking the user to continue.",
    "- If file_edit fails because text was not found, inspect the file again with file_read, grep, or glob before attempting another edit.",
    "- When the user asks to create, modify, run, or open local files, complete the full tool workflow end-to-end whenever the needed tools are available.",
    ...(HOST_PLATFORM === "Windows"
      ? [
          "- For shell commands on Windows, prefer cmd or PowerShell syntax such as dir, Get-ChildItem, or powershell -Command instead of ls unless the environment clearly provides Unix shell utilities.",
        ]
      : []),
    "- After tool results are returned, continue the task using those results and give a normal assistant answer when done.",
    "",
    "Allowed tools:",
    toolLines,
  ].join("\\n");
}

function sanitizeAssistantContent(content: string): string {
  return content.replace(/^\s+/, "").trimEnd();
}

function parseToolCallBlock(rawBlock: string): ParsedToolCall | null {
  const normalizedBlock = normalizeToolCallTags(rawBlock);
  try {
    const parsed = JSON.parse(normalizedBlock) as Record<string, unknown>;
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const input = parsed.input;

    if (!name || !input || typeof input !== "object" || Array.isArray(input)) {
      return null;
    }

    return {
      id: generateToolCallId(),
      name,
      input: input as Record<string, unknown>,
    };
  } catch {
    return parseLooseToolCallBlock(normalizedBlock);
  }
}

function parseAssistantTurn(raw: string): AssistantTurnParseResult {
  const parsedOutput = parseAssistantOutput(raw);
  const toolCalls: ParsedToolCall[] = [];
  const normalizedToolCallContent = normalizeToolCallTags(parsedOutput.content);
  const toolCallPattern = new RegExp(
    `${TOOL_CALL_OPEN_TAG}\\s*([\\s\\S]*?)\\s*${TOOL_CALL_CLOSE_TAG}`,
    "g",
  );
  const contentWithoutToolCalls = normalizedToolCallContent.replace(
    toolCallPattern,
    (_fullMatch: string, rawBlock: string) => {
      const toolCall = parseToolCallBlock(rawBlock);
      if (toolCall) {
        toolCalls.push(toolCall);
      }
      return "";
    },
  );

  return {
    content: sanitizeAssistantContent(contentWithoutToolCalls),
    thinking: parsedOutput.thinking,
    toolCalls,
  };
}

function toProviderToolDefinitions(
  toolDefinitions: ToolDefinition[],
): ProviderToolDefinition[] {
  return toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

function isModelVisibleTool(toolDefinition: ToolDefinition): boolean {
  return toolDefinition.modelVisible !== false;
}

function mergeToolCalls(
  parsedToolCalls: ParsedToolCall[],
  nativeToolCalls: ParsedToolCall[],
): ParsedToolCall[] {
  const merged = [...nativeToolCalls];
  const nativeSignatures = new Set(
    nativeToolCalls.map(
      (toolCall) => `${toolCall.name}:${safeJsonStringify(toolCall.input)}`,
    ),
  );

  for (const toolCall of parsedToolCalls) {
    const signature = `${toolCall.name}:${safeJsonStringify(toolCall.input)}`;
    if (!nativeSignatures.has(signature)) {
      merged.push(toolCall);
    }
  }

  return merged;
}

function applyToolCallDeltas(
  accumulators: Map<number, NativeToolCallAccumulator>,
  deltas: StreamToolCallDelta[],
): void {
  for (const delta of deltas) {
    const index = delta.index ?? 0;
    const current = accumulators.get(index) ?? {
      id: delta.id ?? generateToolCallId(),
      name: delta.name ?? "",
      inputJson: "",
    };

    accumulators.set(index, {
      id: delta.id ?? current.id,
      name: delta.name ?? current.name,
      inputJson: `${current.inputJson}${delta.argumentsDelta ?? ""}`,
    });
  }
}

function finalizeNativeToolCalls(
  accumulators: Map<number, NativeToolCallAccumulator>,
): ParsedToolCall[] {
  return Array.from(accumulators.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, toolCall]) => {
      if (!toolCall.name.trim()) {
        return null;
      }

      try {
        const parsedInput = JSON.parse(toolCall.inputJson || "{}") as unknown;
        if (
          !parsedInput ||
          typeof parsedInput !== "object" ||
          Array.isArray(parsedInput)
        ) {
          return null;
        }

        return {
          id: toolCall.id,
          name: toolCall.name,
          input: parsedInput as Record<string, unknown>,
        };
      } catch {
        return null;
      }
    })
    .filter((toolCall): toolCall is ParsedToolCall => toolCall !== null);
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

function buildConversationHistory(
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

function buildEffectiveMessages(args: {
  messages: MessageSchema[];
  toolDefinitions: ToolDefinition[];
  agentInstructions?: string;
}): ProviderChatMessage[] {
  const systemParts: string[] = [];

  if (args.agentInstructions && args.agentInstructions.trim().length > 0) {
    systemParts.push(args.agentInstructions.trim());
  }

  systemParts.push(buildToolInstructions(args.toolDefinitions));

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

function buildToolMessageContent(
  toolCall: ParsedToolCall,
  result: ToolResult,
): string {
  const statusLine = result.error ? `status: error` : "status: success";
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

export class ConversationService {
  private repository = getConversationRepository();
  private agentRepository = getAgentRepository();
  private streamingHandlers: Map<string, StreamingEventHandler[]> = new Map();
  private providerService = new ProviderService();
  private toolRegistry = getToolRegistry();
  private frontendConfigRepository = new FrontendConfigRepository();

  async listConversations(options?: {
    limit?: number;
    offset?: number;
    agentId?: string;
  }): Promise<ConversationSchema[]> {
    return this.repository.list(options);
  }

  async getConversation(id: string): Promise<ConversationSchema | null> {
    return this.repository.get(id);
  }

  async createConversation(
    data: CreateConversationSchema,
  ): Promise<ConversationSchema> {
    return this.repository.create(data);
  }

  async createConversationForUser(
    userId: string,
    data: CreateConversationSchema,
  ): Promise<ConversationSchema> {
    return this.repository.create({
      ...data,
      metadata: {
        ...(data.metadata ?? {}),
        ownerUserId: userId,
      },
    });
  }

  async updateConversation(
    id: string,
    data: UpdateConversationSchema,
  ): Promise<ConversationSchema | null> {
    return this.repository.update(id, data);
  }

  async deleteConversation(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async listMessages(
    conversationId: string,
    options?: { limit?: number; offset?: number; role?: string },
  ): Promise<MessageSchema[] | null> {
    return this.repository.listMessages(conversationId, options);
  }

  async appendMessage(
    conversationId: string,
    data: AppendMessageSchema,
  ): Promise<MessageSchema | null> {
    const conversation = await this.repository.get(conversationId);
    if (!conversation) {
      return null;
    }

    const message: MessageSchema = {
      id: this.repository.generateMessageId(),
      role: data.role,
      content: data.content,
      createdAt: new Date().toISOString(),
      toolCalls: data.toolCalls,
      metadata: data.metadata,
    };

    const updated = await this.repository.addMessage(conversationId, message);
    return updated ? message : null;
  }

  async updateMessageContent(
    conversationId: string,
    messageId: string,
    delta: string,
  ): Promise<void> {
    const message = await this.repository.getMessageById(
      conversationId,
      messageId,
    );
    if (!message) return;

    message.content = (message.content ?? "") + delta;
    await this.repository.updateMessage(conversationId, messageId, message);
  }

  onStreamingEvent(
    conversationId: string,
    handler: StreamingEventHandler,
  ): () => void {
    const handlers = this.streamingHandlers.get(conversationId) ?? [];
    handlers.push(handler);
    this.streamingHandlers.set(conversationId, handlers);

    return () => {
      const h = this.streamingHandlers.get(conversationId);
      if (h) {
        const index = h.indexOf(handler);
        if (index >= 0) {
          h.splice(index, 1);
        }
      }
    };
  }

  emitStreamingEvent(conversationId: string, event: StreamingEvent): void {
    const handlers = this.streamingHandlers.get(conversationId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error("Failed to emit streaming event", error);
        }
      }
    }
  }

  async executeStreaming(
    conversationId: string,
    _message: string,
    options?: {
      model?: string;
      provider?: string;
      tools?: string[];
      signal?: AbortSignal;
    },
  ): Promise<{ jobId: string; messageId: string }> {
    const conversation = await this.repository.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    let messageId = this.repository.generateMessageId();
    const jobId = `stream_${messageId}`;

    const providerId = options?.provider;
    const modelId = options?.model;
    const agent = conversation.metadata?.agentId
      ? await this.agentRepository.get(conversation.metadata.agentId)
      : null;
    const agentInstructions = agent?.instructions?.trim();
    const agentAllowedTools = agent
      ? normalizeToolNameList(
          agent.toolPermissions?.allowedTools ?? agent.tools,
        ).filter(
          (toolName) =>
            !(agent.toolPermissions?.deniedTools ?? []).includes(toolName),
        )
      : [];
    const resolvedToolNames =
      options?.tools !== undefined ? options.tools : agentAllowedTools;
    const allowedTools = normalizeToolNameList(resolvedToolNames);
    const allowedToolDefinitions = allowedTools
      .map((toolName) => this.toolRegistry.get(toolName)?.definition)
      .filter(
        (definition): definition is ToolDefinition => definition !== undefined,
      )
      .filter(isModelVisibleTool);
    const allowedCallableTools = allowedToolDefinitions.map(
      (definition) => definition.name,
    );
    const providerToolDefinitions = toProviderToolDefinitions(
      allowedToolDefinitions,
    );

    let assistantMessage: MessageSchema = {
      id: messageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };

    const updatedConversation = await this.repository.addMessage(
      conversationId,
      assistantMessage,
    );
    if (!updatedConversation) {
      throw new Error("Failed to create assistant message");
    }

    if (!providerId || !modelId) {
      const error = new Error("Provider and model are required");
      this.emitStreamingEvent(conversationId, {
        type: "error",
        data: { message: error.message },
        conversationId,
        messageId,
      });
      throw error;
    }

    let shouldEmitComplete = false;
    const frontendConfig = await this.frontendConfigRepository.get();
    const maxToolLoopIterations =
      frontendConfig.toolLoopLimitEnabled === false
        ? MAX_TOOL_LOOP_ITERATIONS_LIMIT
        : resolveMaxToolLoopIterations(
            frontendConfig.maxToolLoopIterations,
          );

    try {
      for (
        let iteration = 0;
        iteration < maxToolLoopIterations;
        iteration += 1
      ) {
        const currentMessages = (await this.listMessages(conversationId)) ?? [];
        const providerMessages = buildEffectiveMessages({
          messages: currentMessages.filter(
            (message) => message.id !== messageId,
          ),
          toolDefinitions: allowedToolDefinitions,
          agentInstructions,
        });

        let streamedContent = "";
        let visibleContent = "";
        const baseVisibleContent = assistantMessage.content;
        const baseThinking =
          typeof assistantMessage.metadata?.thinking === "string"
            ? assistantMessage.metadata.thinking
            : undefined;
        let thinkingState: ThinkingState = {
          thinking: "",
          unclosed: false,
          toolCallUnclosed: false,
        };
        const nativeToolCallAccumulators = new Map<
          number,
          NativeToolCallAccumulator
        >();
        let latestUsage: ProviderUsage | undefined;
        let persistedAssistantMessage = assistantMessage;
        let persistChain = Promise.resolve();

        await this.providerService.stream(
          providerId,
          modelId,
          providerMessages,
          (chunk: StreamChunk) => {
            if (options?.signal?.aborted) {
              return;
            }
            if (chunk.toolCallDeltas && chunk.toolCallDeltas.length > 0) {
              applyToolCallDeltas(
                nativeToolCallAccumulators,
                chunk.toolCallDeltas,
              );
            }
            latestUsage = mergeUsage(latestUsage, chunk.usage);
            streamedContent += chunk.delta;
            const { content, state } = parseChunk(chunk.delta, thinkingState);
            thinkingState = state;
            visibleContent += content;
            const combinedVisibleContent = `${baseVisibleContent}${visibleContent}`;
            const combinedThinking = mergeAssistantText(
              baseThinking,
              thinkingState.thinking.trim().length > 0
                ? thinkingState.thinking
                : undefined,
            );
            const hasThinking = combinedThinking !== undefined;
            persistedAssistantMessage = {
              ...persistedAssistantMessage,
              content: combinedVisibleContent,
              metadata: {
                ...(persistedAssistantMessage.metadata ?? {}),
                ...(hasThinking ? { thinking: combinedThinking } : {}),
                ...(latestUsage
                  ? {
                      tokens: latestUsage.totalTokens,
                      usage: latestUsage,
                    }
                  : {}),
              },
            };
            if (!hasThinking && persistedAssistantMessage.metadata) {
              persistedAssistantMessage.metadata = {
                ...persistedAssistantMessage.metadata,
                thinking: undefined,
              };
            }
            persistChain = persistChain.then(async () => {
              await this.repository.updateMessage(
                conversationId,
                messageId,
                persistedAssistantMessage,
              );
            });
            this.emitStreamingEvent(conversationId, {
              type: "chunk",
              data: {
                chunk: chunk.delta,
                content: combinedVisibleContent,
                metadata: hasThinking
                  ? {
                      thinking: combinedThinking,
                      ...(latestUsage
                        ? {
                            tokens: latestUsage.totalTokens,
                            usage: latestUsage,
                          }
                        : {}),
                    }
                  : latestUsage
                    ? {
                        tokens: latestUsage.totalTokens,
                        usage: latestUsage,
                      }
                    : {},
              },
              conversationId,
              messageId,
            });
          },
          providerToolDefinitions,
          allowedToolDefinitions.length > 0 ? "auto" : undefined,
          options?.signal,
        );

        await persistChain;

        const parsedTurn = parseAssistantTurn(streamedContent);
        const nativeToolCalls = finalizeNativeToolCalls(
          nativeToolCallAccumulators,
        );
        const mergedToolCalls = mergeToolCalls(
          parsedTurn.toolCalls,
          nativeToolCalls,
        );
        const previousToolCalls = assistantMessage.toolCalls ?? [];
        const executedToolCalls = mergedToolCalls.map((toolCall) => {
          const existing = previousToolCalls.find((tc) => tc.id === toolCall.id);
          if (existing && (existing.output !== undefined || existing.error)) {
            return {
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.input,
              output: existing.output,
              error: existing.error,
            };
          }
          return {
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
          };
        });
        const completeThinking = mergeAssistantText(
          baseThinking,
          parsedTurn.thinking,
        );
        const hasThinking = completeThinking !== undefined;
        const completeContent = `${baseVisibleContent}${parsedTurn.content}`;

        const assistantMessageUpdate: MessageSchema = {
          ...assistantMessage,
          content: completeContent,
          toolCalls:
            executedToolCalls.length > 0
              ? executedToolCalls
              : assistantMessage.toolCalls,
          metadata: {
            ...(assistantMessage.metadata ?? {}),
            ...(hasThinking ? { thinking: completeThinking } : {}),
            ...(latestUsage
              ? {
                  tokens: latestUsage.totalTokens,
                  usage: latestUsage,
                }
              : {}),
          },
        };
        if (!hasThinking && assistantMessageUpdate.metadata) {
          assistantMessageUpdate.metadata = {
            ...assistantMessageUpdate.metadata,
            thinking: undefined,
          };
        }

        await this.repository.updateMessage(
          conversationId,
          messageId,
          assistantMessageUpdate,
        );
        assistantMessage = assistantMessageUpdate;

        if (mergedToolCalls.length === 0) {
          shouldEmitComplete = true;
          this.emitStreamingEvent(conversationId, {
            type: "complete",
            data: {
              content: completeContent,
              toolCalls: assistantMessageUpdate.toolCalls,
              metadata: {
                ...(hasThinking ? { thinking: completeThinking } : {}),
                ...(latestUsage
                  ? {
                      tokens: latestUsage.totalTokens,
                      usage: latestUsage,
                    }
                  : {}),
              },
            },
            conversationId,
            messageId,
          });
          break;
        }

        const toolExecutionRecords = await this.executeToolCalls(
          conversationId,
          messageId,
          mergedToolCalls,
          allowedCallableTools,
        );

        const updatedToolCalls = toolExecutionRecords.map(
          (record) => record.toolCall,
        );
        await this.repository.updateMessage(conversationId, messageId, {
          ...assistantMessageUpdate,
          toolCalls: updatedToolCalls,
        });

        const newAssistantMessage: MessageSchema = {
          id: this.repository.generateMessageId(),
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
        };
        const updatedConv = await this.repository.addMessage(
          conversationId,
          newAssistantMessage,
        );
        if (!updatedConv) {
          throw new Error("Failed to create new assistant message");
        }
        const newMessageId = newAssistantMessage.id;
        this.emitStreamingEvent(conversationId, {
          type: "assistant_message_created",
          data: {
            messageId: newMessageId,
          },
          conversationId,
          messageId: newMessageId,
        });
        messageId = newMessageId;
        assistantMessage = newAssistantMessage;

        if (iteration === maxToolLoopIterations - 1) {
          const limitMessage =
            "Stopped after reaching the maximum tool loop limit.";
          await this.appendMessage(conversationId, {
            role: "tool",
            content: limitMessage,
          });
          this.emitStreamingEvent(conversationId, {
            type: "tool_result",
            data: {
              callId: "tool_loop_limit",
              toolName: "system",
              error: limitMessage,
            },
            conversationId,
            messageId,
          });
        }
      }
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        return { jobId, messageId };
      }
      this.emitStreamingEvent(conversationId, {
        type: "error",
        data: {
          message: error instanceof Error ? error.message : String(error),
        },
        conversationId,
        messageId,
      });
      throw error;
    }

    if (!shouldEmitComplete && !options?.signal?.aborted) {
      this.emitStreamingEvent(conversationId, {
        type: "complete",
        data: {
          content: assistantMessage.content,
          toolCalls: assistantMessage.toolCalls,
          metadata: assistantMessage.metadata ?? {},
        },
        conversationId,
        messageId,
      });
    }

    return { jobId, messageId };
  }

  private async executeToolCalls(
    conversationId: string,
    messageId: string,
    toolCalls: ParsedToolCall[],
    allowedTools: string[],
  ): Promise<ToolExecutionRecord[]> {
    const records: ToolExecutionRecord[] = [];
    const frontendConfig = await this.frontendConfigRepository.get();
    const allowPathsOutsideWorkspace =
      frontendConfig.allowToolPathsOutsideWorkspace === true;

    for (const toolCall of toolCalls) {
      this.emitStreamingEvent(conversationId, {
        type: "tool_call",
        data: {
          callId: toolCall.id,
          toolName: toolCall.name,
          input: toolCall.input,
        },
        conversationId,
        messageId,
      });

      let result: ToolResult;
      if (!allowedTools.includes(toolCall.name)) {
        result = {
          callId: toolCall.id,
          error: `Tool '${toolCall.name}' is not allowed in this conversation`,
        };
      } else {
        result = await this.toolRegistry.execute(
          {
            id: toolCall.id,
            toolName: toolCall.name,
            input: toolCall.input,
          },
          {
            workingDirectory: process.cwd(),
            allowPathsOutsideWorkspace,
            conversationId,
            messageId,
          },
        );
      }

      const toolMessage = await this.appendMessage(conversationId, {
        role: "tool",
        content: buildToolMessageContent(toolCall, result),
      });

      if (!toolMessage) {
        throw new Error(`Failed to persist tool result for '${toolCall.name}'`);
      }

      const executedToolCall: ExecutedToolCall = {
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
        output: result.output,
        error: result.error,
      };

      this.emitStreamingEvent(conversationId, {
        type: "tool_result",
        data: {
          callId: toolCall.id,
          toolName: toolCall.name,
          output: result.output,
          error: result.error,
          toolMessageId: toolMessage.id,
        },
        conversationId,
        messageId,
      });

      records.push({
        toolCall: executedToolCall,
      });
    }

    return records;
  }
}

let serviceInstance: ConversationService | null = null;

export function getConversationService(): ConversationService {
  if (!serviceInstance) {
    serviceInstance = new ConversationService();
  }
  return serviceInstance;
}
