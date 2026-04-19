import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { resolveAllowedPath, assertWritablePath } from "./shared.js";

const FileWriteInputSchema = z.object({
  file_path: z.string().min(1).describe("The file path to write"),
  content: z.string().describe("The full file contents"),
});

type FileWriteInput = z.infer<typeof FileWriteInputSchema>;

interface FileWriteOutput {
  path: string;
  action: "created" | "updated";
  bytesWritten: number;
  linesWritten: number;
}

export const FileWriteTool = buildTool<FileWriteInput, FileWriteOutput>({
  definition: {
    name: "file_write",
    description: "Create a new file or replace an existing file in full.",
    category: "filesystem",
    inputSchema: {
      file_path: { type: "string", description: "The file path to write" },
      content: { type: "string", description: "The full file contents" },
    },
    outputSchema: {
      path: { type: "string" },
      action: { type: "string" },
      bytesWritten: { type: "number" },
      linesWritten: { type: "number" },
    },
  },
  inputValidator: FileWriteInputSchema,
  async execute(input, context) {
    const resolvedPath = resolveAllowedPath(input.file_path, context);
    assertWritablePath(resolvedPath);

    await mkdir(dirname(resolvedPath), { recursive: true });
    const action = existsSync(resolvedPath) ? "updated" : "created";
    await writeFile(resolvedPath, input.content, "utf8");

    return {
      path: resolvedPath,
      action,
      bytesWritten: Buffer.byteLength(input.content, "utf8"),
      linesWritten: input.content.length === 0 ? 0 : input.content.split(/\r?\n/).length,
    };
  },
});
