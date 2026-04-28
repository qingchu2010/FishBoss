export interface ServerSentEvent {
  data: string;
  event?: string;
  id?: string;
  retry?: number;
}

export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];
  let eventName: string | undefined;
  let eventId: string | undefined;
  let eventRetry: number | undefined;

  function dispatchEvent(): ServerSentEvent | null {
    if (dataLines.length === 0) {
      eventName = undefined;
      eventRetry = undefined;
      return null;
    }

    const event: ServerSentEvent = {
      data: dataLines.join("\n"),
      ...(eventName ? { event: eventName } : {}),
      ...(eventId ? { id: eventId } : {}),
      ...(eventRetry !== undefined ? { retry: eventRetry } : {}),
    };
    dataLines = [];
    eventName = undefined;
    eventRetry = undefined;
    return event;
  }

  function handleLine(line: string): ServerSentEvent | null {
    if (line === "") {
      return dispatchEvent();
    }

    if (line.startsWith(":")) {
      return null;
    }

    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    const rawValue = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "data") {
      dataLines.push(value);
    } else if (field === "event") {
      eventName = value;
    } else if (field === "id") {
      eventId = value;
    } else if (field === "retry") {
      const retry = Number(value);
      if (Number.isInteger(retry) && retry >= 0) {
        eventRetry = retry;
      }
    }

    return null;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r\n|\r|\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = handleLine(line);
      if (event) {
        yield event;
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    const event = handleLine(buffer);
    if (event) {
      yield event;
    }
  }

  const finalEvent = dispatchEvent();
  if (finalEvent) {
    yield finalEvent;
  }
}
