import type { ToolkitToolDefinition } from "../types.js";

export const fileReadTool: ToolkitToolDefinition = {
  id: "file_read",
  name: "file_read",
  title: "File Read",
  category: "file",
  description:
    "Reads a file from disk and returns its contents or a selected slice.",
  longDescription:
    "Use this tool when you need to inspect a file without changing it. It supports partial reads through offset and limit options so callers can inspect large files in manageable sections.",
  parameters: [
    {
      name: "file_path",
      type: "string",
      required: true,
      description:
        "Absolute path or working-directory-relative path to the file that should be read.",
    },
    {
      name: "offset",
      type: "number",
      required: false,
      description: "Starting line number for the read window.",
      defaultValue: 1,
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description:
        "Maximum number of lines to return from the chosen starting point.",
      defaultValue: 2000,
    },
  ],
  examples: [
    {
      description: "Read an entire source file from its beginning.",
      input: { file_path: "src/index.ts" },
    },
    {
      description: "Read a later section of a long file.",
      input: { file_path: "README.md", offset: 120, limit: 80 },
    },
  ],
  tags: ["file", "read", "inspect"],
  readOnly: true,
  concurrencySafe: true,
};
