import { del, get, post } from './http'

export interface Skill {
  id: string
  name: string
  description: string
  commands: Array<{ name: string; description: string; handler: string }>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export const skillsApi = {
  async list(): Promise<Skill[]> {
    const response = await get<{ skills: Skill[] }>('/skills')
    return response.skills
  },

  async create(data: Pick<Skill, 'name' | 'description' | 'commands' | 'enabled'>): Promise<Skill> {
    const response = await post<{ skill: Skill }>('/skills', data)
    return response.skill
  },

  async update(id: string, data: Partial<Pick<Skill, 'name' | 'description' | 'commands' | 'enabled'>>): Promise<Skill> {
    const response = await post<{ skill: Skill }>(`/skills/${id}`, data, 'PATCH')
    return response.skill
  },

  async remove(id: string): Promise<void> {
    await del(`/skills/${id}`)
  },

  async importFromUrl(source: string, name?: string) {
    const response = await post<{ result: { success: boolean; skill?: Skill; error?: string } }>('/skills/import', {
      source,
      name,
      enabled: true
    })
    return response.result
  },

  async listCommands(id: string): Promise<string[]> {
    const response = await get<{ commands: string[] }>(`/skills/${id}/commands`)
    return response.commands
  },

  async execute(id: string, command: string, args: Record<string, unknown>) {
    const response = await post<{ result: Record<string, unknown> }>(`/skills/${id}/execute`, { command, args })
    return response.result
  }
}
