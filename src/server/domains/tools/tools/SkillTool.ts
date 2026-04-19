import { z } from "zod";

import { SkillRepository } from "../../../../modules/skills/index.js";
import { buildTool } from "../ToolBuilder.js";

const SkillInputSchema = z.object({
  name: z.string().min(1).describe("Skill id or name to load"),
  user_message: z.string().optional().describe("Optional user task context"),
});

type SkillInput = z.infer<typeof SkillInputSchema>;

interface SkillOutput {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  commands: Array<{
    name: string;
    description: string;
    handler: string;
  }>;
  userMessage?: string;
}

const skillRepository = new SkillRepository();

export const SkillTool = buildTool<SkillInput, SkillOutput>({
  definition: {
    name: "skill",
    description: "Load a stored skill definition by id or name.",
    category: "workflow",
    modelVisible: false,
    inputSchema: {
      name: { type: "string", description: "Skill id or name to load" },
      user_message: {
        type: "string",
        description: "Optional user task context",
        optional: true,
      },
    },
    outputSchema: {
      id: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      enabled: { type: "boolean" },
      commands: { type: "array" },
      userMessage: { type: "string" },
    },
  },
  inputValidator: SkillInputSchema,
  async execute(input) {
    const skills = await skillRepository.list();
    const matchedSkill = skills.find(
      (skill) =>
        skill.id === input.name ||
        skill.name.toLowerCase() === input.name.toLowerCase(),
    );

    if (!matchedSkill) {
      throw new Error(`Skill not found: ${input.name}`);
    }

    return {
      id: matchedSkill.id,
      name: matchedSkill.name,
      description: matchedSkill.description,
      enabled: matchedSkill.enabled,
      commands: matchedSkill.commands.map((command) => ({
        name: command.name,
        description: command.description,
        handler: command.handler,
      })),
      userMessage: input.user_message,
    };
  },
});
