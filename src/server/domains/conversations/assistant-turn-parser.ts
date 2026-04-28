import type { StreamToolCallDelta } from "../../../types/provider.js";
import { getLogger } from "../../logging/index.js";

const logger = getLogger();

export const TOOL_CALL_OPEN_TAG = "<tool_call>";
export const TOOL_CALL_CLOSE_TAG = "</tool_call>";

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";
const LEGACY_TOOL_CALL_OPEN_TAG = "[TOOL_CALL]";
const LEGACY_TOOL_CALL_CLOSE_TAG = "[/TOOL_CALL]";
const TOOL_CALL_TAG_PAIRS = [
  { open: TOOL_CALL_OPEN_TAG, close: TOOL_CALL_CLOSE_TAG },
  { open: LEGACY_TOOL_CALL_OPEN_TAG, close: LEGACY_TOOL_CALL_CLOSE_TAG },
] as const;

export interface ParsedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AssistantTurnParseResult {
  content: string;
  thinking?: string;
  toolCalls: ParsedToolCall[];
}

export interface NativeToolCallAccumulator {
  id: string;
  name: string;
  inputJson: string;
}

export interface ThinkingState {
  thinking: string;
  unclosed: boolean;
  toolCallUnclosed: boolean;
}

export interface ParsedChunk {
  content: string;
  thinkingDelta: string | null;
  state: ThinkingState;
}

export interface ParseAssistantTurnOptions {
  parseTextToolCalls?: boolean;
}

function preview(value: string): string {
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
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

function normalizeLooseToolCallBlock(rawBlock: string): string {
  return rawBlock
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/\r/g, "")
    .trim();
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
  const normalized = normalizeLooseToolCallBlock(rawBlock);
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
        .replace(/^[\s\-\u2013\u2014\u2022+]+/, "")
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

function generateToolCallId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    logger.warn("Failed to stringify assistant parser value", {
      error: String(_error),
    });
    return JSON.stringify({ value: String(value) }, null, 2);
  }
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
  } catch (error) {
    const looseToolCall = parseLooseToolCallBlock(normalizedBlock);
    if (!looseToolCall) {
      logger.warn("Failed to parse text tool-call block", {
        error: String(error),
        block: preview(normalizedBlock),
      });
    }
    return looseToolCall;
  }
}

export function parseChunk(raw: string, state: ThinkingState): ParsedChunk {
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

export function parseAssistantTurn(
  raw: string,
  options: ParseAssistantTurnOptions = {},
): AssistantTurnParseResult {
  const parseTextToolCalls = options.parseTextToolCalls ?? true;
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
      if (parseTextToolCalls) {
        const toolCall = parseToolCallBlock(rawBlock);
        if (toolCall) {
          toolCalls.push(toolCall);
        }
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

export function mergeToolCalls(
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

export function applyToolCallDeltas(
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

export function finalizeNativeToolCalls(
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
      } catch (error) {
        logger.warn("Failed to parse native tool-call arguments", {
          error: String(error),
          id: toolCall.id,
          name: toolCall.name,
          inputJson: preview(toolCall.inputJson),
        });
        return null;
      }
    })
    .filter((toolCall): toolCall is ParsedToolCall => toolCall !== null);
}
