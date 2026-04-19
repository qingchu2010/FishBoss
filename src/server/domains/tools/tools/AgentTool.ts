import { writeFile } from "node:fs/promises";
import { sep } from "node:path";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { ensureToolStateDirectory } from "./shared.js";
import { generateId } from "../../../../utils/string.js";
import { getAgentRepository } from "../../agents/repository.js";

const AgentInputSchema = z.object({
  subagent_type: z.string().min(1).describe("Target agent id or name"),
  prompt: z.string().min(1).describe("Delegated task prompt"),
  run_in_background: z.boolean().optional().default(false),
});

type AgentInput = z.infer<typeof AgentInputSchema>;

interface AgentOutput {
  requestId: string;
  targetAgentId?: string;
  targetAgentName?: string;
  status: "recorded";
  runInBackground: boolean;
  prompt: string;
}

const agentRepository = getAgentRepository();

export const AgentTool = buildTool<AgentInput, AgentOutput>({
  definition: {
    name: "agent",
    description: "Record a delegated task for another FishBoss agent.",
    category: "workflow",
    modelVisible: false,
    inputSchema: {
      subagent_type: {
        type: "string",
        description: "Target agent id or name",
      },
      prompt: { type: "string", description: "Delegated task prompt" },
      run_in_background: {
        type: "boolean",
        description: "Whether the task should run in background",
        optional: true,
        default: false,
      },
    },
    outputSchema: {
      requestId: { type: "string" },
      targetAgentId: { type: "string" },
      targetAgentName: { type: "string" },
      status: { type: "string" },
      runInBackground: { type: "boolean" },
      prompt: { type: "string" },
    },
  },
  inputValidator: AgentInputSchema,
  async execute(input, context) {
    const agents = await agentRepository.list();
    const targetAgent = agents.find(
      (agent) =>
        agent.id === input.subagent_type ||
        agent.name.toLowerCase() === input.subagent_type.toLowerCase(),
    );
    const requestId = generateId();
    const directory = await ensureToolStateDirectory("agent-requests");
    const filePath = `${directory}${sep}${requestId}.json`;

    const output: AgentOutput = {
      requestId,
      targetAgentId: targetAgent?.id,
      targetAgentName: targetAgent?.name,
      status: "recorded",
      runInBackground: input.run_in_background,
      prompt: input.prompt,
    };

    await writeFile(
      filePath,
      JSON.stringify(
        {
          ...output,
          subagentType: input.subagent_type,
          conversationId: context.conversationId,
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
