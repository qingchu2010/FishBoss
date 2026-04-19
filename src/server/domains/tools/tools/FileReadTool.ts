import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { toolsDomainConfig } from "../config.js";
import { toolSecurityManager } from "../security.js";

const FileReadInputSchema = z.object({
  file_path: z.string().min(1).describe("The file path to read"),
  offset: z.coerce.number().int().min(0).optional().default(0),
  limit: z
    .coerce.number()
    .int()
    .min(1)
    .max(toolsDomainConfig.maxReadLines)
    .optional()
    .default(toolsDomainConfig.maxReadLines),
  encoding: z.enum(["utf-8", "ascii", "base64"]).optional().default("utf-8"),
});

type FileReadInput = z.infer<typeof FileReadInputSchema>;

interface FileReadOutput {
  path: string;
  name: string;
  content: string;
  totalLines: number;
  selectedLines: number;
  offset: number;
  limit: number;
  size: number;
  encoding: "utf-8" | "ascii" | "base64";
  isBinary: boolean;
}

export const FileReadTool = buildTool<FileReadInput, FileReadOutput>({
  definition: {
    name: "file_read",
    description:
      "Read file contents with optional line-range selection and binary detection.",
    category: "filesystem",
    inputSchema: {
      file_path: { type: "string", description: "The file path to read" },
      offset: {
        type: "number",
        description: "Zero-based starting line",
        optional: true,
        default: 0,
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read",
        optional: true,
        default: toolsDomainConfig.maxReadLines,
      },
      encoding: {
        type: "string",
        enum: ["utf-8", "ascii", "base64"],
        optional: true,
        default: "utf-8",
      },
    },
    outputSchema: {
      path: { type: "string" },
      name: { type: "string" },
      content: { type: "string" },
      totalLines: { type: "number" },
      selectedLines: { type: "number" },
      size: { type: "number" },
      encoding: { type: "string" },
      isBinary: { type: "boolean" },
    },
  },
  inputValidator: FileReadInputSchema,
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

    const fileStats = await stat(resolvedPath);
    if (!fileStats.isFile()) {
      throw new Error(`Path is not a file: ${resolvedPath}`);
    }

    const sizeValidation = toolSecurityManager.validateFileSize(fileStats.size);
    if (!sizeValidation.valid) {
      throw new Error(sizeValidation.error ?? "File size validation failed");
    }

    const buffer = await readFile(resolvedPath);
    const isBinary = buffer
      .subarray(0, Math.min(buffer.length, 8000))
      .includes(0);

    if (isBinary) {
      return {
        path: resolvedPath,
        name: basename(resolvedPath),
        content: buffer.toString("base64"),
        totalLines: 0,
        selectedLines: 0,
        offset: 0,
        limit: 0,
        size: fileStats.size,
        encoding: "base64",
        isBinary: true,
      };
    }

    const text = buffer.toString(
      input.encoding === "base64" ? "utf8" : input.encoding,
    );
    const lines = text.split(/\r?\n/);
    const selectedLines = lines.slice(input.offset, input.offset + input.limit);

    return {
      path: resolvedPath,
      name: basename(resolvedPath),
      content: selectedLines.join("\n"),
      totalLines: lines.length,
      selectedLines: selectedLines.length,
      offset: input.offset,
      limit: input.limit,
      size: fileStats.size,
      encoding: input.encoding,
      isBinary: false,
    };
  },
});
