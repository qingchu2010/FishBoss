import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { toolsDomainConfig } from "../config.js";
import { toolSecurityManager } from "../security.js";

const FileEditInputSchema = z
  .object({
    file_path: z.string().min(1).describe("The file path to edit"),
    old_str: z.string().min(1).optional(),
    old_string: z.string().min(1).optional(),
    new_str: z.string().optional(),
    new_string: z.string().optional(),
  })
  .transform((input) => ({
    file_path: input.file_path,
    old_string: input.old_string ?? input.old_str ?? "",
    new_string: input.new_string ?? input.new_str ?? "",
  }));

type FileEditInput = z.infer<typeof FileEditInputSchema>;

interface FileEditOutput {
  path: string;
  occurrences: number;
  bytesWritten: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const FileEditTool = buildTool<FileEditInput, FileEditOutput>({
  definition: {
    name: "file_edit",
    description:
      "Edit an existing text file using a single exact search/replace operation.",
    category: "filesystem",
    inputSchema: {
      file_path: { type: "string", description: "The file path to edit" },
      old_string: { type: "string", description: "Exact text to replace" },
      new_string: { type: "string", description: "Replacement text" },
    },
    outputSchema: {
      path: { type: "string" },
      occurrences: { type: "number" },
      bytesWritten: { type: "number" },
    },
  },
  inputValidator: FileEditInputSchema,
  async execute(input, context) {
    const resolvedPath = toolSecurityManager.resolvePath(
      input.file_path,
      context.workingDirectory,
    );
    const pathValidation = toolSecurityManager.validatePath(
      resolvedPath,
      context.workingDirectory,
      context.allowPathsOutsideWorkspace,
    );
    if (!pathValidation.valid) {
      throw new Error(pathValidation.error ?? "Path validation failed");
    }

    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    if (toolSecurityManager.isReadOnlyPath(resolvedPath)) {
      throw new Error(
        `Refusing to edit read-only system path: ${resolvedPath}`,
      );
    }

    const originalContent = await readFile(resolvedPath, "utf8");
    if (!originalContent.includes(input.old_string)) {
      const preview = originalContent
        .split(/\r?\n/)
        .filter((line) => line.includes(input.old_string.slice(0, 20)))
        .slice(0, toolsDomainConfig.maxFileEditSuggestions)
        .join("\n");
      const suffix = preview ? ` Similar lines:\n${preview}` : "";
      throw new Error(`Target text not found in file.${suffix}`);
    }

    const occurrences = (
      originalContent.match(
        new RegExp(escapeRegExp(input.old_string), "g"),
      ) ?? []
    ).length;
    if (occurrences !== 1) {
      throw new Error(
        `Expected exactly 1 match for old_str but found ${occurrences}.`,
      );
    }

    const updatedContent = originalContent.replace(
      input.old_string,
      input.new_string,
    );
    await writeFile(resolvedPath, updatedContent, "utf8");

    return {
      path: resolvedPath,
      occurrences,
      bytesWritten: Buffer.byteLength(updatedContent, "utf8"),
    };
  },
});
