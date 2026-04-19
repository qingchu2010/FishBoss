import { z } from "zod";

import { toolkitRegistry } from "../../../../toolkit/index.js";
import { buildTool } from "../ToolBuilder.js";
import { getToolRegistry } from "../index.js";

const ToolSearchInputSchema = z.object({
  query: z.string().min(1).describe("Tool search query"),
});

type ToolSearchInput = z.infer<typeof ToolSearchInputSchema>;

interface ToolSearchOutput {
  query: string;
  results: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    executable: boolean;
  }>;
  count: number;
}

export const ToolSearchTool = buildTool<ToolSearchInput, ToolSearchOutput>({
  definition: {
    name: "tool_search",
    description: "Search available toolkit tools by name, category, or description.",
    category: "workflow",
    modelVisible: false,
    inputSchema: {
      query: { type: "string", description: "Tool search query" },
    },
    outputSchema: {
      query: { type: "string" },
      results: { type: "array" },
      count: { type: "number" },
    },
  },
  inputValidator: ToolSearchInputSchema,
  async execute(input) {
    const runtimeRegistry = getToolRegistry();
    const results = toolkitRegistry.search(input.query).map((tool) => ({
      id: tool.id,
      title: tool.title,
      description: tool.description,
      category: tool.category,
      executable: runtimeRegistry.has(tool.id),
    }));

    return {
      query: input.query,
      results,
      count: results.length,
    };
  },
});
