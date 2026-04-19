import type { ToolkitToolDefinition } from "../types.js";

export const globTool: ToolkitToolDefinition = {
  id: "glob",
  name: "glob",
  title: "Glob",
  category: "search",
  description: "Finds files whose paths match a glob pattern.",
  longDescription:
    "Use this tool to discover files by name or path shape, such as all TypeScript files under a directory. It is useful when callers know the pattern they want but not the exact file paths.",
  parameters: [
    {
      name: "pattern",
      type: "string",
      required: true,
      description: "Glob expression used to match files, such as src/**/*.ts.",
    },
    {
      name: "path",
      type: "string",
      required: false,
      description: "Optional base directory where the search should start.",
    },
  ],
  examples: [
    {
      description: "List all TypeScript files in src.",
      input: { path: "src", pattern: "**/*.ts" },
    },
  ],
  tags: ["search", "files", "glob"],
  readOnly: true,
  concurrencySafe: true,
};
