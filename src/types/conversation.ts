export type ConversationActor = "user" | "assistant" | "system" | "tool";

export type ConversationStatus =
  | "pending"
  | "streaming"
  | "waiting_tool"
  | "completed"
  | "error"
  | "aborted";

export interface ConversationUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface MessageToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

export interface MessageMetadata {
  finishReason?: string;
  tokens?: number;
  thinking?: string;
  usage?: ConversationUsage;
}

export interface Message {
  id: string;
  role: ConversationActor;
  content: string;
  createdAt: Date;
  toolCalls?: MessageToolCall[];
  metadata?: MessageMetadata;
}

export interface TextTurnPart {
  type: "text";
  id: string;
  text: string;
}

export interface ReasoningTurnPart {
  type: "reasoning";
  id: string;
  text: string;
  visibility: "internal" | "debug";
}

export interface ToolCallTurnPart {
  type: "tool_call";
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  status: "requested" | "executing" | "completed" | "failed";
  output?: unknown;
  error?: string;
}

export interface ToolResultTurnPart {
  type: "tool_result";
  id: string;
  toolCallId: string;
  toolName: string;
  success: boolean;
  summary: string;
  outputPreview?: string;
  artifactId?: string;
  error?: string;
}

export interface ArtifactRefTurnPart {
  type: "artifact_ref";
  id: string;
  artifactId: string;
  label: string;
}

export interface ErrorTurnPart {
  type: "error";
  id: string;
  message: string;
  code?: string;
}

export type ConversationTurnPart =
  | TextTurnPart
  | ReasoningTurnPart
  | ToolCallTurnPart
  | ToolResultTurnPart
  | ArtifactRefTurnPart
  | ErrorTurnPart;

export interface ConversationTurn {
  id: string;
  actor: ConversationActor;
  status: ConversationStatus;
  createdAt: Date;
  completedAt?: Date;
  parts: ConversationTurnPart[];
  usage?: ConversationUsage;
}

export interface ConversationMetadata {
  agentId?: string;
  providerId?: string;
  modelId?: string;
  tags?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  version?: 1 | 2;
  messages: Message[];
  turns?: ConversationTurn[];
  metadata: ConversationMetadata;
}

export interface RuntimeTextInputPart {
  type: "text";
  text: string;
}

export interface RuntimeToolCallInputPart {
  type: "tool_call";
  id: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface RuntimeToolResultInputPart {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  success: boolean;
  summary: string;
  artifactId?: string;
}

export type RuntimeInputPart =
  | RuntimeTextInputPart
  | RuntimeToolCallInputPart
  | RuntimeToolResultInputPart;

export type RuntimeTurnInput =
  | { actor: "system" | "user"; text: string }
  | { actor: "assistant" | "tool"; parts: RuntimeInputPart[] };
