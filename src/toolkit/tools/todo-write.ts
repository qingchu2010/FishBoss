import type { ToolkitToolDefinition } from "../types.js";

export const todoWriteTool: ToolkitToolDefinition = {
  id: "todo_write",
  name: "todo_write",
  title: "Todo Write",
  category: "workflow",
  description: "Creates or updates a structured task list for active work.",
  longDescription:
    "Use this tool to track progress during multi-step work. It records the current task list, including priorities and statuses, so a session can show what is pending, active, or already done.",
  parameters: [
    {
      name: "todos",
      type: "array",
      required: true,
      description:
        "Ordered list of todo items to store for the current task session.",
    },
  ],
  tags: ["workflow", "planning", "tracking"],
  readOnly: false,
  concurrencySafe: false,
};
