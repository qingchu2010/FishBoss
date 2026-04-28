export interface NewlineDelimitedJsonOptions {
  onInvalidLine?: (line: string, error: unknown) => void;
}

export async function* readNewlineDelimitedJson<T>(
  body: ReadableStream<Uint8Array>,
  options: NewlineDelimitedJsonOptions = {},
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function parseLine(line: string): T | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed) as T;
    } catch (error) {
      options.onInvalidLine?.(trimmed, error);
      return null;
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed) {
        yield parsed;
      }
    }
  }

  buffer += decoder.decode();
  const parsed = parseLine(buffer);
  if (parsed) {
    yield parsed;
  }
}
