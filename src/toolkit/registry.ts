import type {
  ToolkitCategory,
  ToolkitToolDefinition,
  ToolRegistry,
} from "./types.js";
import {
  agentTool,
  askUserQuestionTool,
  bashTool,
  fileEditTool,
  fileReadTool,
  fileWriteTool,
  globTool,
  grepTool,
  notebookEditTool,
  skillTool,
  todoWriteTool,
  toolSearchTool,
  webFetchTool,
  webSearchTool,
} from "./tools/index.js";

export const toolkitTools: ToolkitToolDefinition[] = [
  fileReadTool,
  fileEditTool,
  fileWriteTool,
  notebookEditTool,
  globTool,
  grepTool,
  toolSearchTool,
  bashTool,
  webFetchTool,
  webSearchTool,
  todoWriteTool,
  skillTool,
  askUserQuestionTool,
  agentTool,
];

export class ToolkitRegistry implements ToolRegistry {
  private readonly toolsById: Map<string, ToolkitToolDefinition>;

  public constructor(tools: ToolkitToolDefinition[] = toolkitTools) {
    this.toolsById = new Map(tools.map((tool) => [tool.id, tool]));
  }

  public list(): ToolkitToolDefinition[] {
    return Array.from(this.toolsById.values());
  }

  public get(id: string): ToolkitToolDefinition | undefined {
    return this.toolsById.get(id);
  }

  public has(id: string): boolean {
    return this.toolsById.has(id);
  }

  public getByCategory(category: ToolkitCategory): ToolkitToolDefinition[] {
    return this.list().filter((tool) => tool.category === category);
  }

  public search(query: string): ToolkitToolDefinition[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return this.list();
    }

    return this.list().filter((tool) => {
      return (
        tool.id.toLowerCase().includes(normalizedQuery) ||
        tool.name.toLowerCase().includes(normalizedQuery) ||
        tool.title.toLowerCase().includes(normalizedQuery) ||
        tool.description.toLowerCase().includes(normalizedQuery) ||
        tool.longDescription.toLowerCase().includes(normalizedQuery) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      );
    });
  }
}

export const toolkitRegistry = new ToolkitRegistry();
