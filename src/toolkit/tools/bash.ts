import type { ToolkitToolDefinition } from "../types.js";

export const bashTool: ToolkitToolDefinition = {
  id: "bash",
  name: "bash",
  title: "Bash",
  category: "command",
  description: "Runs a shell command inside a chosen working directory.",
  longDescription:
    "Use this tool when work must be delegated to the system shell, such as invoking build scripts or package managers. Inputs typically include the command string and may also include a timeout or working directory.",
  parameters: [
    {
      name: "command",
      type: "string",
      required: true,
      description: "Shell command to execute.",
    },
    {
      name: "workdir",
      type: "string",
      required: false,
      description: "Optional working directory used when running the command.",
    },
    {
      name: "timeout",
      type: "number",
      required: false,
      description:
        "Optional timeout in milliseconds before execution is aborted.",
    },
  ],
  tags: ["command", "shell", "process"],
  readOnly: false,
  concurrencySafe: false,
};
