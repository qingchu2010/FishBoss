import type { ToolkitToolDefinition } from "../types.js";

export const fileEditTool: ToolkitToolDefinition = {
  id: "file_edit",
  name: "file_edit",
  title: "File Edit",
  category: "file",
  description: "Updates a file by replacing existing text with new text.",
  longDescription:
    "Use this tool to make a targeted change inside an existing file. Callers provide the current text to match and the replacement text to write, which keeps edits explicit and easy to review.",
  parameters: [
    {
      name: "file_path",
      type: "string",
      required: true,
      description: "Path to the file that should be changed.",
    },
    {
      name: "old_string",
      type: "string",
      required: true,
      description: "Exact text expected to exist before the edit is applied.",
    },
    {
      name: "new_string",
      type: "string",
      required: true,
      description:
        "Replacement text that should be written in place of the matched content.",
    },
  ],
  examples: [
    {
      description: "Rename a value inside a TypeScript file.",
      input: {
        file_path: "src/config.ts",
        old_string: "const port = 3000;",
        new_string: "const port = 4000;",
      },
    },
  ],
  tags: ["file", "edit", "replace"],
  readOnly: false,
  concurrencySafe: false,
};
