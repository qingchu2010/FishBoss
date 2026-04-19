import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import {
  MAX_SEARCH_RESULTS,
  globPatternToRegExp,
  resolveAllowedPath,
  toRelativeSearchPath,
  walkFiles,
} from "./shared.js";

const GlobInputSchema = z.object({
  pattern: z.string().min(1).describe("Glob pattern to match"),
  path: z.string().optional().describe("Optional base directory"),
});

type GlobInput = z.infer<typeof GlobInputSchema>;

interface GlobOutput {
  basePath: string;
  pattern: string;
  files: string[];
  count: number;
  truncated: boolean;
}

export const GlobTool = buildTool<GlobInput, GlobOutput>({
  definition: {
    name: "glob",
    description: "Find files under a directory whose paths match a glob pattern.",
    category: "search",
    inputSchema: {
      pattern: { type: "string", description: "Glob pattern to match" },
      path: {
        type: "string",
        description: "Optional base directory",
        optional: true,
      },
    },
    outputSchema: {
      basePath: { type: "string" },
      pattern: { type: "string" },
      files: { type: "array" },
      count: { type: "number" },
      truncated: { type: "boolean" },
    },
  },
  inputValidator: GlobInputSchema,
  async execute(input, context) {
    const basePath = resolveAllowedPath(input.path ?? ".", context);
    const matcher = globPatternToRegExp(input.pattern);
    const files: string[] = [];
    let truncated = false;

    await walkFiles(basePath, async (filePath) => {
      const relativePath = toRelativeSearchPath(basePath, filePath);
      if (matcher.test(relativePath)) {
        files.push(filePath);
      }

      if (files.length >= MAX_SEARCH_RESULTS) {
        truncated = true;
        return true;
      }

      return false;
    });

    return {
      basePath,
      pattern: input.pattern,
      files,
      count: files.length,
      truncated,
    };
  },
});
