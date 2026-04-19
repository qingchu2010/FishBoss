export interface Skill {
  id: string;
  name: string;
  description: string;
  commands: SkillCommand[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillCommand {
  name: string;
  description: string;
  handler: string;
}
