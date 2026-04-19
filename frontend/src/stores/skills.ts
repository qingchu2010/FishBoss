import { defineStore } from 'pinia'
import { ref } from 'vue'
import { skillsApi, type Skill } from '@/services/skills'

export { type Skill }

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<Skill[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchSkills() {
    isLoading.value = true
    error.value = null
    try {
      skills.value = await skillsApi.list()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch skills'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function createSkill(data: Pick<Skill, 'name' | 'description' | 'commands' | 'enabled'>) {
    const skill = await skillsApi.create(data)
    skills.value.unshift(skill)
    return skill
  }

  async function updateSkill(id: string, data: Partial<Pick<Skill, 'name' | 'description' | 'commands' | 'enabled'>>) {
    const skill = await skillsApi.update(id, data)
    const index = skills.value.findIndex((item) => item.id === id)
    if (index !== -1) {
      skills.value[index] = skill
    }
    return skill
  }

  async function deleteSkill(id: string) {
    await skillsApi.remove(id)
    skills.value = skills.value.filter((skill) => skill.id !== id)
  }

  async function importSkill(source: string, name?: string) {
    return skillsApi.importFromUrl(source, name)
  }

  async function executeSkill(id: string, command: string, args: Record<string, unknown>) {
    return skillsApi.execute(id, command, args)
  }

  return {
    skills,
    isLoading,
    error,
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    importSkill,
    executeSkill
  }
})
