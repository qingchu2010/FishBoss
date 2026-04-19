export type ToolkitValueType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object";

export type ToolkitCategory =
  | "file"
  | "search"
  | "command"
  | "web"
  | "workflow"
  | "agent";

export interface ToolkitToolParameter {
  name: string;
  type: ToolkitValueType;
  required: boolean;
  description: string;
  defaultValue?: string | number | boolean | string[] | Record<string, unknown>;
  enumValues?: string[];
}

export interface ToolkitToolExample {
  description: string;
  input: Record<string, unknown>;
}

export interface ToolkitToolDefinition {
  id: string;
  name: string;
  title: string;
  category: ToolkitCategory;
  description: string;
  longDescription: string;
  parameters: ToolkitToolParameter[];
  examples?: ToolkitToolExample[];
  tags: string[];
  readOnly: boolean;
  concurrencySafe: boolean;
}

export interface ToolRegistry {
  list(): ToolkitToolDefinition[];
  get(id: string): ToolkitToolDefinition | undefined;
  has(id: string): boolean;
  getByCategory(category: ToolkitCategory): ToolkitToolDefinition[];
  search(query: string): ToolkitToolDefinition[];
}
