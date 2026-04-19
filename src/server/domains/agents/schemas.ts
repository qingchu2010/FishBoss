import { z } from 'zod';

export const AgentSettingsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    topP: z.number().min(0).max(1).optional(),
    frequencyPenalty: z.number().min(0).max(2).optional(),
    presencePenalty: z.number().min(0).max(2).optional(),
    responseFormat: z.enum(['text', 'json']).optional(),
    seed: z.number().int().optional(),
  })
  .optional();

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional().default(''),
  instructions: z.string().min(1).max(10000),
  tools: z.array(z.string()).optional().default([]),
  toolPermissions: z
    .object({
      allowedTools: z.array(z.string()).optional(),
      deniedTools: z.array(z.string()).optional(),
    })
    .optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  settings: AgentSettingsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional().default(''),
  instructions: z.string().min(1).max(10000),
  tools: z.array(z.string()).optional().default([]),
  toolPermissions: z
    .object({
      allowedTools: z.array(z.string()).optional(),
      deniedTools: z.array(z.string()).optional(),
    })
    .optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  settings: AgentSettingsSchema,
});

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  instructions: z.string().min(1).max(10000).optional(),
  tools: z.array(z.string()).optional(),
  toolPermissions: z
    .object({
      allowedTools: z.array(z.string()).optional(),
      deniedTools: z.array(z.string()).optional(),
    })
    .optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  settings: AgentSettingsSchema.optional(),
});

export const TestAgentSchema = z.object({
  agentId: z.string(),
  message: z.string().min(1).max(5000),
  conversationId: z.string().optional(),
  stream: z.boolean().optional().default(false),
});

export const ListAgentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type AgentSchema = z.infer<typeof AgentSchema>;
export type CreateAgentSchema = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentSchema = z.infer<typeof UpdateAgentSchema>;
export type TestAgentSchema = z.infer<typeof TestAgentSchema>;
export type ListAgentsQuerySchema = z.infer<typeof ListAgentsQuerySchema>;
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;
