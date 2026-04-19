import type { ToolkitToolDefinition } from "../types.js";

export const skillTool: ToolkitToolDefinition = {
  id: "skill",
  name: "skill",
  title: "Skill",
  category: "workflow",
  description:
    "Loads a named skill or command bundle with task-specific guidance.",
  longDescription:
    "Use this tool when the system exposes reusable skills, slash commands, or specialist playbooks. It helps callers bring in focused instructions before carrying out a domain-specific workflow.",
  parameters: [
    {
      name: "name",
      type: "string",
      required: true,
      description: "Identifier of the skill or command to load.",
    },
    {
      name: "user_message",
      type: "string",
      required: false,
      description: "Optional task context passed to the loaded skill.",
    },
  ],
  tags: ["workflow", "skill", "guidance"],
  readOnly: true,
  concurrencySafe: true,
};
