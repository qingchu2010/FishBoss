import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import {
  MAX_SEARCH_FILE_SIZE_BYTES,
  MAX_SEARCH_RESULTS,
  globPatternToRegExp,
  resolveAllowedPath,
  toRelativeSearchPath,
  walkFiles,
} from "./shared.js";

const GrepInputSchema = z.object({
  pattern: z.string().min(1).describe("Text or regular expression to search"),
  path: z.string().optional().describe("Optional base directory"),
  include: z
    .string()
    .optional()
    .describe("Optional glob filter for candidate files"),
});

type GrepInput = z.infer<typeof GrepInputSchema>;

interface GrepMatch {
  path: string;
  line: number;
  content: string;
}

interface GrepOutput {
  basePath: string;
  pattern: string;
  include?: string;
  matches: GrepMatch[];
  count: number;
  truncated: boolean;
}

function createPatternMatcher(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "i");
  }
}

export const GrepTool = buildTool<GrepInput, GrepOutput>({
  definition: {
    name: "grep",
    description: "Search file contents for matching text or regular expressions.",
    category: "search",
    inputSchema: {
      pattern: { type: "string", description: "Text or regular expression to search" },
      path: {
        type: "string",
        description: "Optional base directory",
        optional: true,
      },
      include: {
        type: "string",
        description: "Optional glob filter for candidate files",
        optional: true,
      },
    },
    outputSchema: {
      basePath: { type: "string" },
      pattern: { type: "string" },
      matches: { type: "array" },
      count: { type: "number" },
      truncated: { type: "boolean" },
    },
  },
  inputValidator: GrepInputSchema,
  async execute(input, context) {
    const basePath = resolveAllowedPath(input.path ?? ".", context);
    const contentMatcher = createPatternMatcher(input.pattern);
    const includeMatcher = input.include
      ? globPatternToRegExp(input.include)
      : undefined;
    const matches: GrepMatch[] = [];
    let truncated = false;

    await walkFiles(basePath, async (filePath) => {
      const relativePath = toRelativeSearchPath(basePath, filePath);
      if (includeMatcher && !includeMatcher.test(relativePath)) {
        return false;
      }

      const fileStats = await stat(filePath);
      if (fileStats.size > MAX_SEARCH_FILE_SIZE_BYTES) {
        return false;
      }

      const content = await readFile(filePath, "utf8").catch(() => "");
      if (!content) {
        return false;
      }

      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (!contentMatcher.test(lines[index])) {
          continue;
        }

        matches.push({
          path: filePath,
          line: index + 1,
          content: lines[index].trim(),
        });

        if (matches.length >= MAX_SEARCH_RESULTS) {
          truncated = true;
          return true;
        }
      }

      return false;
    });

    return {
      basePath,
      pattern: input.pattern,
      include: input.include,
      matches,
      count: matches.length,
      truncated,
    };
  },
});
