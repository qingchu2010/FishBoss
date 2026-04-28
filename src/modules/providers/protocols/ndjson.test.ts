import { describe, expect, it } from "vitest";
import { readNewlineDelimitedJson } from "./ndjson.js";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("newline-delimited JSON parser", () => {
  it("parses split JSON lines and trailing buffered JSON", async () => {
    const stream = streamFrom([
      '{"a"',
      ':1}\n{"b":',
      '2}',
    ]);
    const values = [];

    for await (const value of readNewlineDelimitedJson(stream)) {
      values.push(value);
    }

    expect(values).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("reports invalid lines and keeps parsing", async () => {
    const invalidLines: string[] = [];
    const stream = streamFrom(['{"ok":true}\n', 'bad\n', '{"next":true}\n']);
    const values = [];

    for await (const value of readNewlineDelimitedJson(stream, {
      onInvalidLine(line) {
        invalidLines.push(line);
      },
    })) {
      values.push(value);
    }

    expect(values).toEqual([{ ok: true }, { next: true }]);
    expect(invalidLines).toEqual(["bad"]);
  });
});
