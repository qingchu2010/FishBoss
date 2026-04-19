import type { ToolkitToolDefinition } from "../types.js";

export const grepTool: ToolkitToolDefinition = {
  id: "grep",
  name: "grep",
  title: "Grep",
  category: "search",
  description: "Searches file contents for text or regular-expression matches.",
  longDescription:
    "Use this tool to locate code, text, or patterns within files. It supports scoped searching through a base path and optional include filter so callers can narrow the search surface.",
  parameters: [
    {
      name: "pattern",
      type: "string",
      required: true,
      description:
        "Text or regular expression to search for within file contents.",
    },
    {
      name: "path",
      type: "string",
      required: false,
      description: "Optional directory root for the search operation.",
    },
    {
      name: "include",
      type: "string",
      required: false,
      description: "Optional file filter, such as *.ts or *.{ts,tsx}.",
    },
  ],
  tags: ["search", "content", "regex"],
  readOnly: true,
  concurrencySafe: true,
};
