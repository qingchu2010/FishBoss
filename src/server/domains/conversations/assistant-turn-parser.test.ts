import { describe, expect, it } from "vitest";
import {
  applyToolCallDeltas,
  finalizeNativeToolCalls,
  parseAssistantTurn,
  parseChunk,
  type NativeToolCallAccumulator,
  type ThinkingState,
} from "./assistant-turn-parser.js";

describe("assistant turn parser", () => {
  it("extracts thinking and text tool calls", () => {
    const parsed = parseAssistantTurn(
      [
        "hello",
        "<think>private reasoning</think>",
        "visible",
        '<tool_call>{"name":"bash","input":{"command":"pwd"}}</tool_call>',
        "done",
      ].join(" "),
    );

    expect(parsed.content).toContain("hello");
    expect(parsed.content).toContain("visible");
    expect(parsed.content).toContain("done");
    expect(parsed.content).not.toContain("tool_call");
    expect(parsed.thinking).toBe("private reasoning");
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0]).toMatchObject({
      name: "bash",
      input: { command: "pwd" },
    });
  });

  it("strips text tool calls without parsing them for native tool protocols", () => {
    const parsed = parseAssistantTurn(
      'answer <tool_call>{"name":"bash","input":{"command":"pwd"}}</tool_call>',
      { parseTextToolCalls: false },
    );

    expect(parsed.content).toBe("answer");
    expect(parsed.toolCalls).toEqual([]);
  });

  it("accumulates native tool call deltas in stream order", () => {
    const accumulators = new Map<number, NativeToolCallAccumulator>();

    applyToolCallDeltas(accumulators, [
      {
        id: "call_1",
        name: "bash",
        argumentsDelta: '{"command":"',
        index: 0,
      },
      {
        argumentsDelta: "pwd\"}",
        index: 0,
      },
    ]);

    expect(finalizeNativeToolCalls(accumulators)).toEqual([
      {
        id: "call_1",
        name: "bash",
        input: { command: "pwd" },
      },
    ]);
  });

  it("hides complete text tool-call blocks while streaming", () => {
    const state: ThinkingState = {
      thinking: "",
      unclosed: false,
      toolCallUnclosed: false,
    };
    const parsed = parseChunk(
      'hello <tool_call>{"name":"bash","input":{"command":"pwd"}}</tool_call> done',
      state,
    );

    expect(parsed.content).toBe("hello  done");
    expect(parsed.state.toolCallUnclosed).toBe(false);
  });
});
