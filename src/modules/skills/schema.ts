import { z } from 'zod';
import type { Skill, SkillCommand } from '../../types/skill.js';

export const SkillCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  handler: z.string().min(1),
});

export type SkillCommandInput = z.infer<typeof SkillCommandSchema>;

export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  commands: z.array(SkillCommandSchema),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SkillInput = z.infer<typeof SkillSchema>;

export const CreateSkillSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string(),
  commands: z.array(SkillCommandSchema),
  enabled: z.boolean(),
});

export const UpdateSkillSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  commands: z.array(SkillCommandSchema).optional(),
  enabled: z.boolean().optional(),
});

export const ImportSkillSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  name: z.string().min(1).optional(),
  enabled: z.boolean(),
});

export const ExecuteSkillSchema = z.object({
  command: z.string().min(1, 'Command is required'),
  args: z.record(z.unknown()),
});

export interface SkillResponse {
  id: string;
  name: string;
  description: string;
  commands: SkillCommand[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecuteSkillResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  output?: string;
}

export function toSkillResponse(skill: Skill): SkillResponse {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    commands: skill.commands,
    enabled: skill.enabled,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
}
