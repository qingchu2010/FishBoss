import type { ToolkitToolDefinition } from "../types.js";

export const agentTool: ToolkitToolDefinition = {
  id: "agent",
  name: "agent",
  title: "Agent",
  category: "agent",
  description: "Dispatches work to another agent with a focused prompt.",
  longDescription:
    "Use this tool when a task should be handed to a separate agent for parallel work or specialized handling. Typical inputs identify the target agent, describe the job, and optionally indicate whether the task should continue in the background.",
  parameters: [
    {
      name: "subagent_type",
      type: "string",
      required: true,
      description: "Type or name of the agent that should receive the task.",
    },
    {
      name: "prompt",
      type: "string",
      required: true,
      description: "Instructions that define the delegated task.",
    },
    {
      name: "run_in_background",
      type: "boolean",
      required: false,
      description: "Whether the delegated task should continue asynchronously.",
      defaultValue: false,
    },
  ],
  tags: ["agent", "delegation", "parallel"],
  readOnly: false,
  concurrencySafe: false,
};
