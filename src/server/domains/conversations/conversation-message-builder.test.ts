import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "../tools/index.js";
import {
  buildToolInstructions,
  resolveConversationToolProtocol,
} from "./conversation-message-builder.js";

const toolDefinition: ToolDefinition = {
  name: "bash",
  description: "Execute a shell command.",
  inputSchema: {
    command: { type: "string" },
  },
};

describe("conversation message builder", () => {
  it("uses native tool instructions for OpenAI and Anthropic compatible providers", () => {
    const instructions = buildToolInstructions([toolDefinition], "native");

    expect(instructions).toContain("native tool calling interface");
    expect(instructions).not.toContain('{"name":"tool_name"');
    expect(instructions).toContain("Do not emit <tool_call>...</tool_call>");
  });

  it("keeps text tool-call instructions for providers without native tools", () => {
    const instructions = buildToolInstructions([toolDefinition], "text");

    expect(instructions).toContain("<tool_call>");
    expect(instructions).toContain('{"name":"tool_name","input":{"key":"value"}}');
  });

  it("resolves Ollama to text tools and OpenAI compatible providers to native tools", () => {
    expect(
      resolveConversationToolProtocol({
        type: "ollama",
        protocol: "ollama",
      }),
    ).toBe("text");
    expect(
      resolveConversationToolProtocol({
        type: "custom",
        protocol: "generic",
      }),
    ).toBe("native");
  });
});
