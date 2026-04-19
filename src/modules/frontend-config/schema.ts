import { z } from 'zod';

export const FrontendThemeSchema = z.enum(['dark', 'light']);
export const FrontendLocaleSchema = z.enum(['zh_CN', 'en']);

export const FrontendConfigSchema = z.object({
  theme: FrontendThemeSchema.optional(),
  locale: FrontendLocaleSchema.optional(),
  allowToolPathsOutsideWorkspace: z.boolean().optional(),
  maxToolLoopIterations: z.number().int().min(1).max(32).optional(),
  toolLoopLimitEnabled: z.boolean().optional(),
});

export const UpdateFrontendConfigSchema = FrontendConfigSchema;

export type FrontendConfig = z.infer<typeof FrontendConfigSchema>;
