import type { ToolkitToolDefinition } from "../types.js";

export const webFetchTool: ToolkitToolDefinition = {
  id: "web_fetch",
  name: "web_fetch",
  title: "Web Fetch",
  category: "web",
  description: "Downloads content from a URL for later inspection.",
  longDescription:
    "Use this tool to retrieve the contents of a web page or remote document without launching a browser session. It is well suited to reference material, documentation pages, and other fetchable text resources.",
  parameters: [
    {
      name: "url",
      type: "string",
      required: true,
      description: "Fully qualified URL that should be fetched.",
    },
    {
      name: "format",
      type: "string",
      required: false,
      description: "Preferred response format for the fetched content.",
      enumValues: ["markdown", "text", "html"],
    },
  ],
  tags: ["web", "fetch", "http"],
  readOnly: true,
  concurrencySafe: true,
};
