<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessageSquare } from 'lucide-vue-next'
import ConversationsSidebar from '@/components/chat/ConversationsSidebar.vue'
import MessageItem from '@/components/chat/MessageItem.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import { useConversationsStore } from '@/stores'
import { useI18n } from '@/i18n'

const route = useRoute()
const router = useRouter()
const store = useConversationsStore()
const { t } = useI18n()
const draft = ref('')

const conversationId = computed(() => route.params.id as string | undefined)
const conversation = computed(() => store.currentConversation)
const messages = computed(() =>
  (conversation.value?.messages ?? []).filter((message) => message.role !== 'tool')
)

onMounted(async () => {
  await store.fetchConversations()
  if (!conversationId.value) {
    if (store.conversations.length > 0) {
      await router.replace(`/conversations/${store.conversations[0].id}`)
    } else {
      const newConv = await store.createConversation({ title: t('conversation.newTitle') })
      await router.replace(`/conversations/${newConv.id}`)
    }
  } else {
    await store.fetchConversation(conversationId.value)
  }
})

watch(conversationId, async (newId) => {
  if (newId) {
    await store.fetchConversation(newId)
  }
})

async function handleSend() {
  const content = draft.value.trim()
  if (!content) return
  draft.value = ''
  await store.sendMessage(content)
}

async function handleCreateConversation() {
  const newConversation = await store.createConversation({ title: t('conversation.newTitle') })
  await router.push(`/conversations/${newConversation.id}`)
}

async function handleSelectConversation(id: string) {
  await router.push(`/conversations/${id}`)
}

async function handleDeleteConversation(id: string) {
  await store.deleteConversation(id)
  if (id === conversationId.value) {
    if (store.conversations[0]) {
      await router.push(`/conversations/${store.conversations[0].id}`)
    } else {
      await router.push('/conversations')
    }
  }
}
</script>

<template>
  <div class="chat-view">
    <ConversationsSidebar
      :conversations="store.conversations"
      :current-id="conversationId ?? null"
      @clear="handleCreateConversation"
      @select="handleSelectConversation"
      @delete="handleDeleteConversation"
    />

    <div class="chat-container">
      <div class="messages-wrapper">
        <div class="messages">
          <div v-if="messages.length === 0 && !store.isStreaming" class="empty-state">
            <div class="empty-icon-wrap"><MessageSquare :size="28" /></div>
            <p>{{ t('chat.emptyStateText') }}</p>
          </div>

          <MessageItem v-for="message in messages" :key="message.id" :msg="message" />
        </div>
      </div>

      <ChatInput
        v-model="draft"
        :is-thinking="store.isStreaming"
        :placeholder="store.isStreaming ? t('chat.inputPlaceholderQueue') : t('chat.inputPlaceholder')"
        @send="handleSend"
        @queue-or-stop="store.stopStreaming()"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-view {
  height: 100%;
  display: flex;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

.chat-container {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.messages-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.messages {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-gutter: stable;
}

.messages::-webkit-scrollbar {
  width: 6px;
}

.messages::-webkit-scrollbar-track {
  background: transparent;
}

.messages::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 3px;
}

.messages::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted);
}

.empty-icon-wrap {
  width: 80px;
  height: 80px;
  opacity: 0.5;
}

.empty-icon-wrap svg {
  width: 100%;
  height: 100%;
}
</style>
