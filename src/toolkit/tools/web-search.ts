import type { ToolkitToolDefinition } from "../types.js";

export const webSearchTool: ToolkitToolDefinition = {
  id: "web_search",
  name: "web_search",
  title: "Web Search",
  category: "web",
  description: "Searches the public web and returns relevant result summaries.",
  longDescription:
    "Use this tool when a task needs current information or external references that are not already present in the workspace. It is intended for discovery, while a fetch tool can be used afterward to inspect a specific result in detail.",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description:
        "Natural-language search request describing the desired information.",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "Maximum number of result entries to return.",
      defaultValue: 10,
    },
  ],
  tags: ["web", "search", "research"],
  readOnly: true,
  concurrencySafe: true,
};
