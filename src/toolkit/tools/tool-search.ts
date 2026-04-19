import type { ToolkitToolDefinition } from "../types.js";

export const toolSearchTool: ToolkitToolDefinition = {
  id: "tool_search",
  name: "tool_search",
  title: "Tool Search",
  category: "search",
  description: "Looks up tool metadata by name, tag, or descriptive text.",
  longDescription:
    "Use this tool when a caller needs help discovering which tool fits a task. It searches the registered tool catalog using names, categories, tags, and descriptive copy.",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "Search text used to filter the available tool definitions.",
    },
  ],
  tags: ["search", "tools", "discovery"],
  readOnly: true,
  concurrencySafe: true,
};
