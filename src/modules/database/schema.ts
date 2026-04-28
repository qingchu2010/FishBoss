import { z } from "zod";

export const DATABASE_STATUS = {
  READY: "ready",
} as const;

export const DatabaseReferenceSchema = z.object({
  id: z.string().min(1),
  namespace: z.string().min(1),
  ownerUserId: z.string().min(1),
  conversationId: z.string().optional(),
  title: z.string().min(1),
  content: z.record(z.unknown()),
  tags: z.array(z.string()).optional().default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UpsertDatabaseReferenceSchema = z.object({
  namespace: z.string().min(1),
  ownerUserId: z.string().min(1),
  conversationId: z.string().optional(),
  title: z.string().min(1),
  content: z.record(z.unknown()),
  tags: z.array(z.string()).optional().default([]),
});

export const DatabaseReferenceFilterSchema = z.object({
  namespace: z.string().optional(),
  ownerUserId: z.string().optional(),
  conversationId: z.string().optional(),
  limit: z.number().int().positive().optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const DatabaseReferenceFilterQuerySchema =
  DatabaseReferenceFilterSchema.extend({
    limit: z.coerce.number().int().positive().optional().default(50),
    offset: z.coerce.number().int().nonnegative().optional().default(0),
  });

export const DatabaseConversationClassSchema = z.enum([
  "chat-console",
  "qq",
  "onebot",
  "platform",
]);

export const DatabaseMessageThreadSchema = z.object({
  id: z.string().min(1),
  conversationClass: DatabaseConversationClassSchema,
  ownerUserId: z.string().min(1),
  targetId: z.string().min(1),
  platformId: z.string().optional(),
  platformType: z.string().optional(),
  title: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UpsertDatabaseMessageThreadSchema = z.object({
  conversationClass: DatabaseConversationClassSchema,
  ownerUserId: z.string().min(1),
  targetId: z.string().min(1),
  platformId: z.string().optional(),
  platformType: z.string().optional(),
  title: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
});

export const DatabaseMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  conversationClass: DatabaseConversationClassSchema,
  direction: z.enum(["inbound", "outbound", "internal"]),
  senderType: z.enum(["user", "assistant", "system", "platform"]),
  senderId: z.string().optional(),
  externalMessageId: z.string().optional(),
  content: z.string(),
  payload: z.record(z.unknown()).optional().default({}),
  createdAt: z.string().datetime(),
});

export const AppendDatabaseMessageSchema = z.object({
  threadId: z.string().min(1),
  conversationClass: DatabaseConversationClassSchema,
  direction: z.enum(["inbound", "outbound", "internal"]),
  senderType: z.enum(["user", "assistant", "system", "platform"]),
  senderId: z.string().optional(),
  externalMessageId: z.string().optional(),
  content: z.string(),
  payload: z.record(z.unknown()).optional().default({}),
  createdAt: z.string().datetime().optional(),
});

export const DatabaseMessageThreadFilterSchema = z.object({
  conversationClass: DatabaseConversationClassSchema.optional(),
  ownerUserId: z.string().optional(),
  targetId: z.string().optional(),
  platformId: z.string().optional(),
  limit: z.number().int().positive().optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const DatabaseMessageThreadFilterQuerySchema =
  DatabaseMessageThreadFilterSchema.extend({
    limit: z.coerce.number().int().positive().optional().default(50),
    offset: z.coerce.number().int().nonnegative().optional().default(0),
  });

export const DatabaseMessageFilterSchema = z.object({
  threadId: z.string().optional(),
  conversationClass: DatabaseConversationClassSchema.optional(),
  direction: z.enum(["inbound", "outbound", "internal"]).optional(),
  senderType: z.enum(["user", "assistant", "system", "platform"]).optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const DatabaseMessageFilterQuerySchema =
  DatabaseMessageFilterSchema.extend({
    limit: z.coerce.number().int().positive().optional().default(100),
    offset: z.coerce.number().int().nonnegative().optional().default(0),
  });

export type DatabaseReference = z.infer<typeof DatabaseReferenceSchema>;
export type UpsertDatabaseReferenceInput = z.infer<
  typeof UpsertDatabaseReferenceSchema
>;
export type DatabaseReferenceFilter = z.infer<
  typeof DatabaseReferenceFilterSchema
>;
export type DatabaseReferenceFilterQuery = z.infer<
  typeof DatabaseReferenceFilterQuerySchema
>;
export type DatabaseConversationClass = z.infer<
  typeof DatabaseConversationClassSchema
>;
export type DatabaseMessageThread = z.infer<
  typeof DatabaseMessageThreadSchema
>;
export type UpsertDatabaseMessageThreadInput = z.infer<
  typeof UpsertDatabaseMessageThreadSchema
>;
export type DatabaseMessage = z.infer<typeof DatabaseMessageSchema>;
export type AppendDatabaseMessageInput = z.infer<
  typeof AppendDatabaseMessageSchema
>;
export type DatabaseMessageThreadFilter = z.infer<
  typeof DatabaseMessageThreadFilterSchema
>;
export type DatabaseMessageThreadFilterQuery = z.infer<
  typeof DatabaseMessageThreadFilterQuerySchema
>;
export type DatabaseMessageFilter = z.infer<typeof DatabaseMessageFilterSchema>;
export type DatabaseMessageFilterQuery = z.infer<
  typeof DatabaseMessageFilterQuerySchema
>;

export interface DatabaseStatusResponse {
  status: (typeof DATABASE_STATUS)[keyof typeof DATABASE_STATUS];
  message: string;
  storage: {
    kind: "mysqlite";
  };
}
