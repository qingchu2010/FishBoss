import type { FastifyReply, FastifyRequest } from 'fastify';

export interface SSEData {
  event?: string;
  id?: string;
  retry?: number;
  data: unknown;
}

export interface SSEStreamOptions {
  heartbeatInterval?: number;
  maxConnections?: number;
}

export class SSEStream {
  private reply: FastifyReply;
  private isClosed: boolean = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(reply: FastifyReply, _request: FastifyRequest) {
    this.reply = reply;
  }

  private formatMessage(data: SSEData): string {
    let message = '';
    if (data.id) {
      message += `id: ${data.id}\n`;
    }
    if (data.event) {
      message += `event: ${data.event}\n`;
    }
    if (data.retry !== undefined) {
      message += `retry: ${data.retry}\n`;
    }
    const dataStr = typeof data.data === 'string' ? data.data : JSON.stringify(data.data);
    dataStr.split('\n').forEach((line) => {
      message += `data: ${line}\n`;
    });
    return message + '\n';
  }

  send(data: SSEData): void {
    if (this.isClosed) return;
    const message = this.formatMessage(data);
    this.reply.raw?.write(message);
    (this.reply.raw as NodeJS.WritableStream & { flush?: () => void })?.flush?.();
  }

  sendEvent(event: string, data: unknown, id?: string): void {
    this.send({ event, data, id });
  }

  sendComment(comment: string): void {
    if (this.isClosed) return;
    this.reply.raw?.write(`: ${comment}\n\n`);
  }

  private startHeartbeat(intervalMs: number = 30000): void {
    this.heartbeatTimer = setInterval(() => {
      if (!this.isClosed) {
        this.sendComment('heartbeat');
      }
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async start(heartbeatInterval?: number): Promise<void> {
    this.reply.raw!.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    this.reply.raw!.on('close', () => {
      this.close();
    });

    if (heartbeatInterval !== undefined && heartbeatInterval > 0) {
      this.startHeartbeat(heartbeatInterval);
    }

    this.send({ data: { type: 'connected' } });
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.stopHeartbeat();
    if (!this.reply.raw?.writableEnded) {
      this.reply.raw?.end();
    }
  }
}

export interface SSEController {
  stream: SSEStream;
  reply: FastifyReply;
}

export function createSSEController(reply: FastifyReply, request: FastifyRequest): SSEController {
  const stream = new SSEStream(reply, request);
  return { stream, reply };
}

export type SSEEventHandler = (data: unknown, controller: SSEController) => Promise<void> | void;

export class SSEEventEmitter {
  private handlers: Map<string, SSEEventHandler[]> = new Map();
  private controller: SSEController | null = null;

  on(event: string, handler: SSEEventHandler): void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  off(event: string, handler: SSEEventHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  setController(controller: SSEController): void {
    this.controller = controller;
  }

  async emit(event: string, data: unknown): Promise<void> {
    const handlers = this.handlers.get(event);
    if (handlers && this.controller) {
      for (const handler of handlers) {
        await handler(data, this.controller);
      }
    }
  }

  async broadcast(event: string, data: unknown): Promise<void> {
    await this.emit(event, data);
  }
}
