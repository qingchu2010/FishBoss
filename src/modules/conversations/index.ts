import type { Conversation, Message } from '../../types/index.js';

export interface ConversationStore {
  list(): Promise<Conversation[]>;
  get(id: string): Promise<Conversation | null>;
  create(data: Partial<Conversation>): Promise<Conversation>;
  update(id: string, data: Partial<Conversation>): Promise<Conversation>;
  delete(id: string): Promise<void>;
  addMessage(conversationId: string, message: Message): Promise<void>;
}

export interface StreamingOptions {
  conversationId: string;
  messages: Message[];
  model?: string;
  provider?: string;
  tools?: string[];
}

export interface StreamHandler {
  start(options: StreamingOptions): Promise<void>;
  stop(): void;
  onChunk(handler: (chunk: string) => void): void;
  onComplete(handler: () => void): void;
  onError(handler: (error: Error) => void): void;
}
