import { writeFile } from "node:fs/promises";
import { sep } from "node:path";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { ensureToolStateDirectory } from "./shared.js";
import { generateId } from "../../../../utils/string.js";

const AskUserQuestionInputSchema = z.object({
  question: z.string().min(1).describe("Question that should be asked to the user"),
  context: z.string().optional().describe("Optional supporting context"),
});

type AskUserQuestionInput = z.infer<typeof AskUserQuestionInputSchema>;

interface AskUserQuestionOutput {
  requestId: string;
  conversationId?: string;
  status: "pending_user_response";
  question: string;
  context?: string;
}

export const AskUserQuestionTool = buildTool<
  AskUserQuestionInput,
  AskUserQuestionOutput
>({
  definition: {
    name: "ask_user_question",
    description: "Record a question that should be asked to the user before continuing.",
    category: "workflow",
    modelVisible: false,
    inputSchema: {
      question: { type: "string", description: "Question to ask the user" },
      context: {
        type: "string",
        description: "Optional supporting context",
        optional: true,
      },
    },
    outputSchema: {
      requestId: { type: "string" },
      conversationId: { type: "string" },
      status: { type: "string" },
      question: { type: "string" },
      context: { type: "string" },
    },
  },
  inputValidator: AskUserQuestionInputSchema,
  async execute(input, context) {
    const requestId = generateId();
    const directory = await ensureToolStateDirectory("questions");
    const filePath = `${directory}${sep}${requestId}.json`;

    const output: AskUserQuestionOutput = {
      requestId,
      conversationId: context.conversationId,
      status: "pending_user_response",
      question: input.question,
      context: input.context,
    };

    await writeFile(
      filePath,
      JSON.stringify(
        {
          ...output,
          messageId: context.messageId,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );

    return output;
  },
});
