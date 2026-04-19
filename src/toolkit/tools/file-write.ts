import type { ToolkitToolDefinition } from "../types.js";

export const fileWriteTool: ToolkitToolDefinition = {
  id: "file_write",
  name: "file_write",
  title: "File Write",
  category: "file",
  description: "Creates or replaces a file with provided content.",
  longDescription:
    "Use this tool when a file should be written in full rather than patched in place. It is suitable for generating new files or overwriting files whose contents are known completely.",
  parameters: [
    {
      name: "file_path",
      type: "string",
      required: true,
      description: "Destination path for the file being written.",
    },
    {
      name: "content",
      type: "string",
      required: true,
      description:
        "Full text content that should be stored at the destination path.",
    },
  ],
  examples: [
    {
      description: "Create a small configuration file.",
      input: { file_path: "config/example.json", content: '{"enabled":true}' },
    },
  ],
  tags: ["file", "write", "create"],
  readOnly: false,
  concurrencySafe: false,
};
