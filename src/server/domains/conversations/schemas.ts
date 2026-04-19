import { z } from "zod";

export const MessageToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export const MessageMetadataSchema = z
  .object({
    finishReason: z.string().optional(),
    tokens: z.number().optional(),
    thinking: z.string().optional(),
    usage: z
      .object({
        promptTokens: z.number().optional(),
        completionTokens: z.number().optional(),
        totalTokens: z.number().optional(),
      })
      .optional(),
  })
  .optional();

export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  createdAt: z.string().datetime(),
  toolCalls: z.array(MessageToolCallSchema).optional(),
  toolCallId: z.string().optional(),
  name: z.string().optional(),
  metadata: MessageMetadataSchema,
});

export const ConversationUsageSchema = z.object({
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});

export const TextTurnPartSchema = z.object({
  type: z.literal("text"),
  id: z.string(),
  text: z.string(),
});

export const ReasoningTurnPartSchema = z.object({
  type: z.literal("reasoning"),
  id: z.string(),
  text: z.string(),
  visibility: z.enum(["internal", "debug"]),
});

export const ToolCallTurnPartSchema = z.object({
  type: z.literal("tool_call"),
  id: z.string(),
  toolName: z.string(),
  input: z.record(z.unknown()),
  status: z.enum(["requested", "executing", "completed", "failed"]),
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export const ToolResultTurnPartSchema = z.object({
  type: z.literal("tool_result"),
  id: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  success: z.boolean(),
  summary: z.string(),
  outputPreview: z.string().optional(),
  artifactId: z.string().optional(),
  error: z.string().optional(),
});

export const ArtifactRefTurnPartSchema = z.object({
  type: z.literal("artifact_ref"),
  id: z.string(),
  artifactId: z.string(),
  label: z.string(),
});

export const ErrorTurnPartSchema = z.object({
  type: z.literal("error"),
  id: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

export const ConversationTurnPartSchema = z.discriminatedUnion("type", [
  TextTurnPartSchema,
  ReasoningTurnPartSchema,
  ToolCallTurnPartSchema,
  ToolResultTurnPartSchema,
  ArtifactRefTurnPartSchema,
  ErrorTurnPartSchema,
]);

export const ConversationTurnSchema = z.object({
  id: z.string(),
  actor: z.enum(["user", "assistant", "system", "tool"]),
  status: z.enum([
    "pending",
    "streaming",
    "waiting_tool",
    "completed",
    "error",
    "aborted",
  ]),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  parts: z.array(ConversationTurnPartSchema).optional().default([]),
  usage: ConversationUsageSchema.optional(),
});

export const ConversationMetadataSchema = z
  .object({
    agentId: z.string().optional(),
    providerId: z.string().optional(),
    modelId: z.string().optional(),
    ownerUserId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .optional();

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.union([z.literal(1), z.literal(2)]).optional(),
  messages: z.array(MessageSchema).optional().default([]),
  turns: z.array(ConversationTurnSchema).optional().default([]),
  metadata: ConversationMetadataSchema,
});

export const CreateConversationSchema = z.object({
  title: z.string().min(1).max(255).optional().default("New Conversation"),
  metadata: ConversationMetadataSchema,
});

export const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  metadata: ConversationMetadataSchema.optional(),
});

export const AppendMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().min(0),
  toolCalls: z.array(MessageToolCallSchema).optional(),
  toolCallId: z.string().optional(),
  name: z.string().optional(),
  metadata: MessageMetadataSchema,
});

export const ListConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  agentId: z.string().optional(),
});

export const ListMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  role: z.enum(["user", "assistant", "system", "tool"]).optional(),
});

export const StreamConversationSchema = z.object({
  conversationId: z.string(),
  message: z.string().min(1),
  model: z.string().optional(),
  provider: z.string().optional(),
  tools: z.array(z.string()).optional(),
});

export type ConversationSchema = z.infer<typeof ConversationSchema>;
export type CreateConversationSchema = z.infer<typeof CreateConversationSchema>;
export type UpdateConversationSchema = z.infer<typeof UpdateConversationSchema>;
export type MessageSchema = z.infer<typeof MessageSchema>;
export type AppendMessageSchema = z.infer<typeof AppendMessageSchema>;
export type ListConversationsQuerySchema = z.infer<
  typeof ListConversationsQuerySchema
>;
export type ListMessagesQuerySchema = z.infer<typeof ListMessagesQuerySchema>;
export type StreamConversationSchema = z.infer<typeof StreamConversationSchema>;
export type ConversationTurnSchema = z.infer<typeof ConversationTurnSchema>;
export type ConversationTurnPartSchema = z.infer<
  typeof ConversationTurnPartSchema
>;
