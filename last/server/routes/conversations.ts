import { Router } from 'express'
import { readConfigFile, writeConfigFile } from '../storage/index.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

export const conversationsRouter = Router()

const CONFIG_DIR = path.join(os.homedir(), '.fishboss')
const CONVERSATIONS_DIR = path.join(CONFIG_DIR, 'conversations')

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool' | 'compressed'
  content: string
  timestamp: number
  thinking?: string
  toolCallId?: string
  name?: string
  toolCalls?: Array<{
    id: string
    function: {
      name: string
      arguments: string
    }
    status?: 'pending' | 'running' | 'completed' | 'error'
    result?: string
  }>
}

interface ConversationMeta {
  id: string
  title: string
  agentId: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

interface Conversation extends ConversationMeta {
  messages: Message[]
}

async function ensureConversationsDir(): Promise<void> {
  try {
    await fs.access(CONVERSATIONS_DIR)
  } catch {
    await fs.mkdir(CONVERSATIONS_DIR, { recursive: true })
  }
}

function getConversationFilePath(id: string): string {
  return path.join(CONVERSATIONS_DIR, `${id}.json`)
}

async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const filePath = getConversationFilePath(id)
    const data = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(data) as Conversation
  } catch {
    return null
  }
}

async function saveConversation(conversation: Conversation): Promise<void> {
  await ensureConversationsDir()
  const filePath = getConversationFilePath(conversation.id)
  await fs.writeFile(filePath, JSON.stringify(conversation, null, 2), 'utf-8')
}

async function deleteConversationFile(id: string): Promise<void> {
  try {
    const filePath = getConversationFilePath(id)
    await fs.unlink(filePath)
  } catch {
    // File doesn't exist, ignore
  }
}

async function getAllConversations(): Promise<Conversation[]> {
  await ensureConversationsDir()
  const conversations: Conversation[] = []
  
  try {
    const files = await fs.readdir(CONVERSATIONS_DIR)
    for (const file of files) {
      if (file.endsWith('.json')) {
        const id = file.slice(0, -5)
        const conversation = await getConversation(id)
        if (conversation) {
          conversations.push(conversation)
        }
      }
    }
  } catch {
    // Directory doesn't exist or error reading
  }
  
  return conversations
}

let migrationDone = false

async function migrateOldConversations(): Promise<void> {
  if (migrationDone) return
  migrationDone = true
  try {
    const oldData = readConfigFile('conversations.json')
    if (oldData?.conversations && Array.isArray(oldData.conversations)) {
      for (const conversation of oldData.conversations) {
        await saveConversation(conversation)
      }
      const oldFilePath = path.join(CONFIG_DIR, 'conversations.json')
      const backupPath = path.join(CONFIG_DIR, 'conversations.json.backup')
      await fs.rename(oldFilePath, backupPath).catch(() => {})
    }
  } catch {
  }
}

migrateOldConversations().catch(console.error)

conversationsRouter.get('/', async (req, res) => {
  try {
    const conversations = await getAllConversations()
    const list = conversations.map(c => ({
      id: c.id,
      title: c.title,
      agentId: c.agentId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length
    })).sort((a, b) => b.updatedAt - a.updatedAt)
    res.json({ conversations: list })
  } catch (error) {
    res.status(500).json({ error: 'Failed to get conversations' })
  }
})

conversationsRouter.get('/:id', async (req, res) => {
  try {
    const conversation = await getConversation(req.params.id)
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }
    res.json(conversation)
  } catch (error) {
    res.status(500).json({ error: 'Failed to get conversation' })
  }
})

conversationsRouter.post('/', async (req, res) => {
  try {
    const { title, agentId } = req.body
    const newConversation: Conversation = {
      id: Math.random().toString(36).substring(2),
      title: title || 'New Conversation',
      agentId: agentId || null,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0
    }
    await saveConversation(newConversation)
    res.json(newConversation)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create conversation' })
  }
})

conversationsRouter.put('/:id', async (req, res) => {
  try {
    const { title, messages } = req.body
    const conversation = await getConversation(req.params.id)
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }
    
    if (title !== undefined) {
      conversation.title = title
    }
    if (messages !== undefined) {
      conversation.messages = messages
      conversation.messageCount = messages.length
    }
    conversation.updatedAt = Date.now()
    
    await saveConversation(conversation)
    res.json(conversation)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update conversation' })
  }
})

conversationsRouter.delete('/:id', async (req, res) => {
  try {
    await deleteConversationFile(req.params.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete conversation' })
  }
})
