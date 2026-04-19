import type { Response } from 'express';

export type StreamEvent =
  | { type: 'session'; sessionId: string; created: boolean }
  | { type: 'reasoning'; delta: string }
  | { type: 'content'; delta: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; result: string; success: boolean }
  | { type: 'tool_error'; id: string; error: string }
  | { type: 'context_warning'; used: number; limit: number }
  | { type: 'compressed'; messageCount: number }
  | { type: 'done'; finalMessageId: string }
  | { type: 'error'; message: string; code?: string }
  | {
      type: 'ask';
      id: string;
      header?: string;
      questions: Array<{
        question: string;
        options: Array<{ label: string; description: string }>;
        multiSelect: boolean;
      }>;
    }
  | { type: 'ask_result'; askId: string; success: boolean }
  | { type: 'pending_message'; content: string };

export class StreamEmitter {
  private res: Response;
  private sessionId: string;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(res: Response, sessionId: string) {
    this.res = res;
    this.sessionId = sessionId;
    this.startHeartbeat();
    console.log(`[StreamEmitter] Session ${sessionId} initialized`);
  }

  emit(event: StreamEvent): void {
    if (this.closed) {
      console.log(`[StreamEmitter] Session ${this.sessionId} already closed, skipping emit`);
      return;
    }
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  done(finalMessageId: string): Promise<void> {
    console.log(`[StreamEmitter] Session ${this.sessionId} done, finalMessageId: ${finalMessageId}`);
    this.emit({ type: 'done', finalMessageId });
    return this.close();
  }

  error(message: string, code?: string): void {
    console.log(`[StreamEmitter] Session ${this.sessionId} error: ${message}, code: ${code}`);
    this.emit({ type: 'error', message, code });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.closed) {
        this.res.write(': heartbeat\n\n');
      }
    }, 30000);
  }

  private close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.closed) {
        resolve();
        return;
      }
      this.closed = true;
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      console.log(`[StreamEmitter] Session ${this.sessionId} closed`);
      this.res.end();
      resolve();
    });
  }
}
