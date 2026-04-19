import type { SafeParseReturnType } from "zod";

import { getLogger } from "../../logging/index.js";
import type {
  ResolvedToolExecutionContext,
  RuntimeTool,
  ToolDefinition,
} from "./types.js";

const logger = getLogger();

export interface BuildToolConfig<
  TInput extends Record<string, unknown>,
  TOutput,
> {
  definition: ToolDefinition;
  inputValidator: {
    safeParse(input: unknown): SafeParseReturnType<unknown, TInput>;
  };
  execute: (
    input: TInput,
    context: ResolvedToolExecutionContext,
  ) => Promise<TOutput>;
}

export function buildTool<TInput extends Record<string, unknown>, TOutput>(
  config: BuildToolConfig<TInput, TOutput>,
): RuntimeTool<TInput, TOutput> {
  if (!config.definition.name) {
    throw new Error("Tool definition name is required");
  }

  return {
    definition: config.definition,
    validate(input: Record<string, unknown>): TInput {
      const parsed = config.inputValidator.safeParse(input);
      if (!parsed.success) {
        logger.warn(
          `Tool input validation failed for ${config.definition.name}`,
          {
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        );
        throw new Error(
          parsed.error.issues.map((issue) => issue.message).join("; "),
        );
      }

      return parsed.data;
    },
    execute(
      input: TInput,
      context: ResolvedToolExecutionContext,
    ): Promise<TOutput> {
      return config.execute(input, context);
    },
  };
}
