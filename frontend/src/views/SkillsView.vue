<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BookOpen, Download, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-vue-next'
import { useAppStore, useSkillsStore } from '@/stores'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const appStore = useAppStore()
const skillsStore = useSkillsStore()

const showModal = ref(false)
const showImportModal = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const importUrl = ref('')
const commandInput = ref('run')
const executeOutput = ref('')

const formData = ref({
  name: '',
  description: '',
  enabled: true,
  commandsText: 'run|Run the skill|echo placeholder'
})

const skills = computed(() => skillsStore.skills)

onMounted(async () => {
  await skillsStore.fetchSkills()
})

function openAddModal() {
  isEditing.value = false
  editingId.value = null
  formData.value = {
    name: '',
    description: '',
    enabled: true,
    commandsText: 'run|Run the skill|echo placeholder'
  }
  showModal.value = true
}

function openEditModal(skill: (typeof skills.value)[number]) {
  isEditing.value = true
  editingId.value = skill.id
  formData.value = {
    name: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    commandsText: skill.commands.map((command) => `${command.name}|${command.description}|${command.handler}`).join('\n')
  }
  showModal.value = true
}

async function saveSkill() {
  const commands = formData.value.commandsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, description, handler] = line.split('|')
      return { name, description, handler }
    })

  if (isEditing.value && editingId.value) {
    await skillsStore.updateSkill(editingId.value, {
      name: formData.value.name,
      description: formData.value.description,
      enabled: formData.value.enabled,
      commands
    })
    appStore.notify(t('page.skills.skillUpdated'), 'success')
  } else {
    await skillsStore.createSkill({
      name: formData.value.name,
      description: formData.value.description,
      enabled: formData.value.enabled,
      commands
    })
    appStore.notify(t('page.skills.skillCreated'), 'success')
  }

  showModal.value = false
}

async function deleteSkill(id: string) {
  await skillsStore.deleteSkill(id)
  appStore.notify(t('page.skills.skillDeleted'), 'success')
}

async function importSkill() {
  const result = await skillsStore.importSkill(importUrl.value)
  appStore.notify(result.success ? t('page.skills.import') : (result.error ?? t('common.error')), result.success ? 'success' : 'error')
  showImportModal.value = false
  importUrl.value = ''
  await skillsStore.fetchSkills()
}

async function executeSkill(id: string) {
  const result = await skillsStore.executeSkill(id, commandInput.value, {})
  executeOutput.value = JSON.stringify(result, null, 2)
}
</script>

<template>
  <div class="skills-view">
    <div class="skills-header">
      <div class="header-info">
        <h2>{{ t('page.skills.title') }}</h2>
        <p>{{ t('page.skills.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="showImportModal = true">
          <Download :size="16" />
          {{ t('page.skills.import') }}
        </button>
        <button class="btn btn-primary" @click="openAddModal">
          <Plus :size="16" />
          {{ t('page.skills.addSkill') }}
        </button>
      </div>
    </div>

    <div class="skills-grid" v-if="skills.length > 0">
      <div v-for="skill in skills" :key="skill.id" class="skill-card">
        <div class="card-header">
          <div class="skill-name">{{ skill.name }}</div>
        </div>

        <div class="card-body">
          <div class="skill-description">{{ skill.description }}</div>
          <div class="skill-content-preview">
            <span class="preview-label">{{ t('common.prompt') }}:</span>
            <span class="preview-text">{{ skill.commands.map((command) => command.name).join(', ') }}</span>
          </div>
        </div>

        <div class="card-footer">
          <button class="btn btn-ghost btn-sm" @click="openEditModal(skill)">
            <Pencil :size="14" />
            {{ t('common.edit') }}
          </button>
          <button class="btn btn-ghost btn-sm" @click="executeSkill(skill.id)">
            <Upload :size="14" />
            {{ t('chat.confirm') }}
          </button>
          <button class="btn btn-ghost btn-sm btn-danger" @click="deleteSkill(skill.id)">
            <Trash2 :size="14" />
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <BookOpen :size="64" class="empty-icon" />
      <p>{{ t('page.skills.noSkills') }}</p>
      <span class="empty-hint">{{ t('page.skills.noSkillsHint') }}</span>
      <button class="btn btn-primary" @click="openAddModal">
        <Plus :size="16" />
        {{ t('page.skills.addSkill') }}
      </button>
    </div>

    <div v-if="executeOutput" class="execute-output">
      <pre>{{ executeOutput }}</pre>
    </div>

    <Transition name="modal">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ isEditing ? t('page.skills.editSkill') : t('page.skills.addSkill') }}</h3>
            <button class="modal-close" @click="showModal = false">
              <X :size="20" />
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="required">{{ t('page.skills.skillName') }}</label>
              <input v-model="formData.name" type="text" class="input" :placeholder="t('page.skills.skillNamePlaceholder')" :disabled="isEditing" />
            </div>
            <div class="form-group">
              <label class="required">{{ t('page.skills.skillDescription') }}</label>
              <input v-model="formData.description" type="text" class="input" :placeholder="t('page.skills.skillDescriptionPlaceholder')" />
            </div>
            <div class="form-group">
              <label>{{ t('page.skills.skillContent') }}</label>
              <textarea v-model="formData.commandsText" class="input textarea" rows="8" :placeholder="t('page.skills.skillContentPlaceholder')"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showModal = false">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" @click="saveSkill">
              <Save :size="16" />
              {{ t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ t('page.skills.importSkills') }}</h3>
            <button class="modal-close" @click="showImportModal = false">
              <X :size="20" />
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="required">{{ t('page.skills.importUrl') }}</label>
              <input v-model="importUrl" type="text" class="input" :placeholder="t('page.skills.importUrlPlaceholder')" />
              <span class="form-hint">{{ t('page.skills.importUrlHint') }}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showImportModal = false">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" @click="importSkill">{{ t('page.skills.import') }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.skills-view { height: 100%; display: flex; flex-direction: column; gap: 24px; overflow: hidden; }
.skills-header { display: flex; justify-content: space-between; align-items: flex-start; }
.header-info h2 { margin: 0 0 4px 0; font-size: 1.5rem; }
.header-actions { display: flex; gap: 12px; }
.skills-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.skill-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.skill-name { font-weight: 600; color: var(--text-primary); }
.card-body { display: flex; flex-direction: column; gap: 10px; }
.skill-description, .preview-text, .empty-hint, .form-hint { color: var(--text-secondary); }
.card-footer { display: flex; gap: 8px; flex-wrap: wrap; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 240px; }
.execute-output { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(9, 11, 20, 0.56); display: grid; place-items: center; z-index: 1000; }
.modal { width: min(560px, calc(100vw - 32px)); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 20px; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; border-bottom: 1px solid var(--border-color); }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { padding: 0 20px 20px; display: flex; justify-content: flex-end; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 10px; }
.required::after { content: ' *'; color: var(--color-error); }
.textarea { min-height: 160px; }
.modal-close { background: transparent; border: none; cursor: pointer; color: var(--text-muted); }
</style>
