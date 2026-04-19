<template>
  <div class="skills-view">
    <div class="skills-header">
      <div class="header-info">
        <h2>{{ t('page.skills.title') }}</h2>
        <p>{{ t('page.skills.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="openImportModal">
          <Download :size="16" />
          {{ t('page.skills.import') }}
        </button>
        <button class="btn btn-primary" @click="openAddModal">
          <Plus :size="16" />
          {{ t('page.skills.addSkill') }}
        </button>
      </div>
    </div>

    <div class="skills-grid" v-if="skillsStore.skills.length > 0">
      <div
        v-for="skill in skillsStore.skills"
        :key="skill.name"
        class="skill-card"
      >
        <div class="card-header">
          <div class="skill-name">{{ skill.name }}</div>
        </div>

        <div class="card-body">
          <div class="skill-description">{{ skill.description }}</div>
          <div class="skill-content-preview">
            <span class="preview-label">{{ t('common.prompt') }}:</span>
            <span class="preview-text">{{ truncateContent(skill.content) }}</span>
          </div>
        </div>

        <div class="card-footer">
          <button class="btn btn-ghost btn-sm" @click="openEditModal(skill)">
            <Pencil :size="14" />
            {{ t('common.edit') }}
          </button>
          <button class="btn btn-ghost btn-sm btn-danger" @click="confirmDelete(skill)">
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

    <Transition name="modal">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ isEditing ? t('page.skills.editSkill') : t('page.skills.addSkill') }}</h3>
            <button class="modal-close" @click="closeModal">
              <X :size="20" />
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="required">{{ t('page.skills.skillName') }}</label>
              <input
                v-model="formData.name"
                type="text"
                class="input"
                :placeholder="t('page.skills.skillNamePlaceholder')"
                :disabled="isEditing"
              />
              <span class="form-hint">{{ t('page.skills.skillNameHint') }}</span>
            </div>

            <div class="form-group">
              <label class="required">{{ t('page.skills.skillDescription') }}</label>
              <input
                v-model="formData.description"
                type="text"
                class="input"
                :placeholder="t('page.skills.skillDescriptionPlaceholder')"
              />
            </div>

            <div class="form-group">
              <label>{{ t('page.skills.skillContent') }}</label>
              <textarea
                v-model="formData.content"
                class="input textarea"
                rows="8"
                :placeholder="t('page.skills.skillContentPlaceholder')"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeModal">
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-primary" @click="saveSkill" :disabled="!isFormValid">
              <Save :size="16" />
              {{ t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3>{{ t('common.confirm') }}</h3>
            <button class="modal-close" @click="showDeleteConfirm = false">
              <X :size="20" />
            </button>
          </div>
          <div class="modal-body">
            <p>{{ t('page.skills.deleteConfirm') }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showDeleteConfirm = false">
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-danger" @click="deleteSkill">
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showImportModal" class="modal-overlay" @click.self="closeImportModal">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ t('page.skills.importSkills') }}</h3>
            <button class="modal-close" @click="closeImportModal">
              <X :size="20" />
            </button>
          </div>
          <div class="modal-body">
            <div class="import-tabs">
              <button 
                :class="['tab-btn', { active: importMode === 'url' }]" 
                @click="importMode = 'url'"
              >
                {{ t('page.skills.fromUrl') }}
              </button>
              <button 
                :class="['tab-btn', { active: importMode === 'zip' }]" 
                @click="importMode = 'zip'"
              >
                {{ t('page.skills.fromZip') }}
              </button>
            </div>

            <div v-if="importMode === 'url'" class="form-group">
              <label class="required">{{ t('page.skills.importUrl') }}</label>
              <input
                v-model="importUrl"
                type="text"
                class="input"
                :placeholder="t('page.skills.importUrlPlaceholder')"
              />
              <span class="form-hint">{{ t('page.skills.importUrlHint') }}</span>
            </div>

            <div v-if="importMode === 'zip'" class="form-group">
              <label>{{ t('page.skills.selectZip') }}</label>
              <div class="file-upload" @click="triggerFileInput" @dragover.prevent @drop.prevent="handleFileDrop">
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".zip"
                  @change="handleFileSelect"
                  hidden
                />
                <Upload :size="32" class="upload-icon" />
                <span v-if="!selectedZipFile" class="upload-text">{{ t('page.skills.dragDropZip') }}</span>
                <span v-else class="upload-text selected">{{ selectedZipFile.name }}</span>
              </div>
              <span class="form-hint">{{ t('page.skills.zipHint') }}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeImportModal">
              {{ t('common.cancel') }}
            </button>
            <button 
              class="btn btn-primary" 
              @click="doImport" 
              :disabled="isImporting || (importMode === 'url' ? !importUrl.trim() : !selectedZipFile)"
            >
              <Download :size="16" />
              {{ isImporting ? t('common.loading') : t('page.skills.import') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Pencil, X, BookOpen, Save, Trash2, Download, Upload } from 'lucide-vue-next'
import { useSkillsStore, type Skill } from '@/stores/skills'
import { useI18n } from '@/i18n'
import { useAppStore } from '@/stores/app'

const { t } = useI18n()
const appStore = useAppStore()
const skillsStore = useSkillsStore()

const showModal = ref(false)
const showDeleteConfirm = ref(false)
const showImportModal = ref(false)
const isEditing = ref(false)
const isImporting = ref(false)
const editingName = ref<string | null>(null)
const deletingSkill = ref<Skill | null>(null)
const importUrl = ref('')
const importMode = ref<'url' | 'zip'>('url')
const selectedZipFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const formData = ref({
  name: '',
  description: '',
  content: ''
})

const isFormValid = computed(() => {
  return formData.value.name.trim() && formData.value.description.trim()
})

onMounted(() => {
  skillsStore.init()
})

function truncateContent(content: string): string {
  if (!content) return ''
  return content.length > 100 ? content.substring(0, 100) + '…' : content
}

function openAddModal() {
  isEditing.value = false
  editingName.value = null
  formData.value = {
    name: '',
    description: '',
    content: ''
  }
  showModal.value = true
}

function openEditModal(skill: Skill) {
  isEditing.value = true
  editingName.value = skill.name
  formData.value = {
    name: skill.name,
    description: skill.description,
    content: skill.content
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  isEditing.value = false
  editingName.value = null
}

async function saveSkill() {
  if (!isFormValid.value) return

  if (isEditing.value && editingName.value) {
    const result = await skillsStore.updateSkill(editingName.value, {
      description: formData.value.description,
      content: formData.value.content
    })
    if (result.success) {
      appStore.notify(t('page.skills.skillUpdated'), 'success')
      closeModal()
    } else {
      appStore.notify(result.error || t('common.error'), 'error')
    }
  } else {
    const result = await skillsStore.createSkill({
      name: formData.value.name,
      description: formData.value.description,
      content: formData.value.content
    })
    if (result.success) {
      appStore.notify(t('page.skills.skillCreated'), 'success')
      closeModal()
    } else {
      appStore.notify(result.error || t('common.error'), 'error')
    }
  }
}

function confirmDelete(skill: Skill) {
  deletingSkill.value = skill
  showDeleteConfirm.value = true
}

async function deleteSkill() {
  if (!deletingSkill.value) return
  
  const result = await skillsStore.deleteSkill(deletingSkill.value.name)
  if (result.success) {
    appStore.notify(t('page.skills.skillDeleted'), 'success')
  } else {
    appStore.notify(result.error || t('common.error'), 'error')
  }
  showDeleteConfirm.value = false
  deletingSkill.value = null
}

function openImportModal() {
  importUrl.value = ''
  importMode.value = 'url'
  selectedZipFile.value = null
  showImportModal.value = true
}

function closeImportModal() {
  showImportModal.value = false
  importUrl.value = ''
  selectedZipFile.value = null
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedZipFile.value = target.files[0]
  }
}

function handleFileDrop(event: DragEvent) {
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    const file = files[0]
    if (file.name.endsWith('.zip')) {
      selectedZipFile.value = file
    } else {
      appStore.notify(t('page.skills.onlyZipAllowed'), 'error')
    }
  }
}

async function doImport() {
  if (isImporting.value) return

  isImporting.value = true
  let result

  if (importMode.value === 'url') {
    if (!importUrl.value.trim()) {
      isImporting.value = false
      return
    }
    result = await skillsStore.importSkills(importUrl.value.trim())
  } else {
    if (!selectedZipFile.value) {
      isImporting.value = false
      return
    }
    result = await skillsStore.importSkillsFromZip(selectedZipFile.value)
  }

  isImporting.value = false

  if (result.success) {
    const count = result.imported?.length || 0
    appStore.notify(t('page.skills.importSuccess', { count: String(count) }), 'success')
    closeImportModal()
    if (result.errors && result.errors.length > 0) {
      console.warn('Import warnings:', result.errors)
    }
  } else {
    appStore.notify(result.error || t('common.error'), 'error')
  }
}
</script>

<style scoped>
.skills-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow: hidden;
}

.skills-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-info h2 {
  margin: 0 0 4px 0;
  font-size: 1.5rem;
}

.header-info p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  flex: 1;
  overflow-y: overlay;
}

.skill-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  transition: all var(--transition-fast);
}

.skill-card:hover {
  border-color: var(--border-color-hover);
  box-shadow: var(--shadow-sm);
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.skill-name {
  font-weight: 600;
  font-size: 1.1rem;
  font-family: var(--font-mono);
}

.card-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.skill-description {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.skill-content-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.preview-text {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.card-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-danger {
  color: var(--status-error);
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.empty-icon {
  opacity: 0.4;
}

.empty-hint {
  font-size: 0.85rem;
  margin-bottom: 8px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  width: 520px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-sm {
  width: 400px;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.modal-close {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.modal-close:hover {
  background: var(--bg-hover);
}

.modal-body {
  padding: 24px;
  overflow-y: overlay;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.form-group label.required::after {
  content: ' *';
  color: var(--status-error);
}

.form-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.textarea {
  resize: vertical;
  min-height: 120px;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: scale(0.95);
  opacity: 0;
}

.import-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tab-btn:hover {
  border-color: var(--border-color-hover);
}

.tab-btn.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.file-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.file-upload:hover {
  border-color: var(--accent-primary);
  background: var(--bg-hover);
}

.upload-icon {
  color: var(--text-muted);
}

.upload-text {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.upload-text.selected {
  color: var(--accent-primary);
  font-weight: 500;
}
</style>
