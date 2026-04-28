import { describe, expect, it } from "vitest";
import { readServerSentEvents } from "./sse.js";

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

describe("server sent event parser", () => {
  it("parses split data events", async () => {
    const stream = streamFrom([
      "data: {\"a\"",
      ":1}\n\n",
      "data: [DONE]\n\n",
    ]);

    const events = [];
    for await (const event of readServerSentEvents(stream)) {
      events.push(event);
    }

    expect(events).toEqual([
      { data: '{"a":1}' },
      { data: "[DONE]" },
    ]);
  });

  it("joins multiline data fields", async () => {
    const stream = streamFrom([
      "event: message\n",
      "data: first\n",
      "data: second\n\n",
    ]);

    const events = [];
    for await (const event of readServerSentEvents(stream)) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        data: "first\nsecond",
        event: "message",
      },
    ]);
  });
});
