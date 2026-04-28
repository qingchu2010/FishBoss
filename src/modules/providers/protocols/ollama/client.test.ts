import { describe, expect, it } from "vitest";
import { toOllamaStreamChunks } from "./client.js";

describe("Ollama stream chunks", () => {
  it("emits usage, text, and done chunks from one frame", () => {
    expect(
      toOllamaStreamChunks({
        model: "llama",
        message: { content: "hello" },
        done: true,
        prompt_eval_count: 3,
        eval_count: 4,
      }),
    ).toEqual([
      {
        delta: "",
        done: false,
        usage: {
          promptTokens: 3,
          completionTokens: 4,
          totalTokens: 7,
        },
      },
      { delta: "hello", done: false },
      { delta: "", done: true },
    ]);
  });

  it("emits only text for non-final content frames", () => {
    expect(
      toOllamaStreamChunks({
        model: "llama",
        message: { content: "part" },
        done: false,
      }),
    ).toEqual([{ delta: "part", done: false }]);
  });
});
