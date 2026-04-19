import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'

const CONFIG_DIR = path.join(os.homedir(), '.fishboss')
const OAUTH_FILE = 'mcp-oauth.json'

const ENCRYPTION_KEY = crypto.createHash('sha256').update(os.hostname() + os.homedir() + os.userInfo().uid).digest()

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

function decrypt(encryptedData: string): string | null {
  try {
    const parts = encryptedData.split(':')
    if (parts.length !== 3) return null
    const iv = Buffer.from(parts[0], 'hex')
    const authTag = Buffer.from(parts[1], 'hex')
    const encrypted = parts[2]
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    return null
  }
}

function readOAuthData(): Record<string, any> {
  ensureConfigDir()
  const filePath = path.join(CONFIG_DIR, OAUTH_FILE)
  if (!fs.existsSync(filePath)) {
    return {}
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(content)
    const decrypted: Record<string, any> = {}
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const decryptedValue = decrypt(value)
        if (decryptedValue) {
          decrypted[key] = JSON.parse(decryptedValue)
        }
      }
    }
    return decrypted
  } catch {
    return {}
  }
}

function writeOAuthData(data: Record<string, any>): boolean {
  ensureConfigDir()
  const filePath = path.join(CONFIG_DIR, OAUTH_FILE)
  try {
    const encrypted: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      encrypted[key] = encrypt(JSON.stringify(value))
    }
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

export async function getOAuthEntry(serverId: string): Promise<Record<string, any> | null> {
  try {
    const data = readOAuthData()
    return data[serverId] || null
  } catch {
    return null
  }
}

export async function setOAuthEntry(serverId: string, entry: Record<string, any>): Promise<boolean> {
  try {
    const data = readOAuthData()
    data[serverId] = entry
    return writeOAuthData(data)
  } catch {
    return false
  }
}

export async function deleteOAuthEntry(serverId: string): Promise<boolean> {
  try {
    const data = readOAuthData()
    delete data[serverId]
    return writeOAuthData(data)
  } catch {
    return false
  }
}

export async function getAllOAuthEntries(): Promise<Record<string, Record<string, any>>> {
  return readOAuthData()
}
