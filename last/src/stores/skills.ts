import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'

export interface Skill {
  name: string
  description: string
  location: string
  content: string
  files?: string[]
  baseUrl?: string
}

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<Skill[]>([])
  const isLoading = ref(false)

  async function loadSkills() {
    isLoading.value = true
    try {
      const data = await api.getSkills()
      skills.value = data.skills || []
    } catch (error) {
      console.error('Failed to load skills:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function getSkill(name: string): Promise<Skill | null> {
    try {
      const data = await api.getSkill(name)
      return data
    } catch (error) {
      console.error('Failed to get skill:', error)
      return null
    }
  }

  async function createSkill(skill: { name: string; description: string; content?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await api.createSkill(skill)
      if (data.success) {
        skills.value.push(data.skill)
        return { success: true }
      }
      return { success: false, error: data.error }
    } catch (error: any) {
      console.error('Failed to create skill:', error)
      return { success: false, error: error.response?.data?.error || error.message }
    }
  }

  async function updateSkill(name: string, updates: { description?: string; content?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await api.updateSkill(name, updates)
      if (data.success) {
        const index = skills.value.findIndex(s => s.name === name)
        if (index !== -1) {
          skills.value[index] = { ...skills.value[index], ...data.skill }
        }
        return { success: true }
      }
      return { success: false, error: data.error }
    } catch (error: any) {
      console.error('Failed to update skill:', error)
      return { success: false, error: error.response?.data?.error || error.message }
    }
  }

  async function deleteSkill(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await api.deleteSkill(name)
      if (data.success) {
        skills.value = skills.value.filter(s => s.name !== name)
        return { success: true }
      }
      return { success: false, error: data.error }
    } catch (error: any) {
      console.error('Failed to delete skill:', error)
      return { success: false, error: error.response?.data?.error || error.message }
    }
  }

  async function importSkills(url: string): Promise<{ success: boolean; imported?: string[]; errors?: string[]; error?: string }> {
    try {
      const data = await api.importSkills(url)
      if (data.success) {
        await loadSkills()
        return { success: true, imported: data.imported, errors: data.errors }
      }
      return { success: false, error: data.error }
    } catch (error: any) {
      console.error('Failed to import skills:', error)
      return { success: false, error: error.response?.data?.error || error.message }
    }
  }

  async function importSkillsFromZip(file: File): Promise<{ success: boolean; imported?: string[]; errors?: string[]; error?: string }> {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      )
      const data = await api.importSkillsFromZip(base64)
      if (data.success) {
        await loadSkills()
        return { success: true, imported: data.imported, errors: data.errors }
      }
      return { success: false, error: data.error }
    } catch (error: any) {
      console.error('Failed to import skills from zip:', error)
      return { success: false, error: error.response?.data?.error || error.message }
    }
  }

  async function init() {
    await loadSkills()
  }

  return {
    skills,
    isLoading,
    loadSkills,
    getSkill,
    createSkill,
    updateSkill,
    deleteSkill,
    importSkills,
    importSkillsFromZip,
    init
  }
})
