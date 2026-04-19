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

export type DatabaseReference = z.infer<typeof DatabaseReferenceSchema>;
export type UpsertDatabaseReferenceInput = z.infer<
  typeof UpsertDatabaseReferenceSchema
>;
export type DatabaseReferenceFilter = z.infer<
  typeof DatabaseReferenceFilterSchema
>;

export interface DatabaseStatusResponse {
  status: (typeof DATABASE_STATUS)[keyof typeof DATABASE_STATUS];
  message: string;
  storage: {
    kind: "mysqlite";
  };
}
