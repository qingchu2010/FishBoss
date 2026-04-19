import type { ToolkitToolDefinition } from "../types.js";

export const askUserQuestionTool: ToolkitToolDefinition = {
  id: "ask_user_question",
  name: "ask_user_question",
  title: "Ask User Question",
  category: "workflow",
  description:
    "Requests missing information directly from the user before continuing.",
  longDescription:
    "Use this tool when progress is blocked by an ambiguity, missing choice, or required approval. It lets a workflow pause and gather the exact answer needed to continue safely.",
  parameters: [
    {
      name: "question",
      type: "string",
      required: true,
      description: "Question that should be presented to the user.",
    },
    {
      name: "context",
      type: "string",
      required: false,
      description:
        "Optional short explanation that gives the user helpful background.",
    },
  ],
  tags: ["workflow", "user", "clarification"],
  readOnly: true,
  concurrencySafe: true,
};
