import os from 'os'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const CONFIG_DIR = path.join(os.homedir(), '.fishboss')

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

function readSecureData(): Record<string, string> {
  ensureConfigDir()
  const filePath = path.join(CONFIG_DIR, 'secure.json')
  if (!fs.existsSync(filePath)) {
    return {}
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(content)
    const decrypted: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      const decryptedValue = decrypt(value as string)
      if (decryptedValue) {
        decrypted[key] = decryptedValue
      }
    }
    return decrypted
  } catch {
    return {}
  }
}

function writeSecureData(data: Record<string, string>): boolean {
  ensureConfigDir()
  const filePath = path.join(CONFIG_DIR, 'secure.json')
  try {
    const encrypted: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      encrypted[key] = encrypt(value)
    }
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

export function readConfigFile(filename: string): any {
  ensureConfigDir()
  const filePath = path.join(CONFIG_DIR, filename)
  if (!fs.existsSync(filePath)) {
    return null
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function writeConfigFile(filename: string, data: any): boolean {
  ensureConfigDir()
  const filePath = path.join(CONFIG_DIR, filename)
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

export function getConfigDir(): string {
  return CONFIG_DIR
}

export async function setProviderApiKey(providerId: string, apiKey: string): Promise<boolean> {
  try {
    const data = readSecureData()
    data[`provider-${providerId}`] = apiKey
    return writeSecureData(data)
  } catch {
    return false
  }
}

export async function getProviderApiKey(providerId: string): Promise<string | null> {
  try {
    const data = readSecureData()
    const secureKey = data[`provider-${providerId}`]
    if (secureKey) return secureKey
  } catch {
  }
  try {
    const providersData = readConfigFile('providers.json')
    if (providersData?.providers) {
      const provider = providersData.providers.find((p: any) => p.id === providerId)
      if (provider?.apiKey) return provider.apiKey
    }
  } catch {
  }
  return null
}

export async function deleteProviderApiKey(providerId: string): Promise<boolean> {
  try {
    const data = readSecureData()
    delete data[`provider-${providerId}`]
    return writeSecureData(data)
  } catch {
    return false
  }
}

export async function getAllProviderApiKeys(providerIds: string[]): Promise<Record<string, string>> {
  const keys: Record<string, string> = {}
  const secureData = readSecureData()
  for (const id of providerIds) {
    const key = secureData[`provider-${id}`]
    if (key) {
      keys[id] = key
    }
  }
  try {
    const providersData = readConfigFile('providers.json')
    if (providersData?.providers) {
      for (const provider of providersData.providers) {
        if (providerIds.includes(provider.id) && provider.apiKey && !keys[provider.id]) {
          keys[provider.id] = provider.apiKey
        }
      }
    }
  } catch {
  }
  return keys
}

export async function deleteAllProviderApiKeys(providerIds: string[]): Promise<void> {
  const data = readSecureData()
  for (const id of providerIds) {
    delete data[`provider-${id}`]
  }
  writeSecureData(data)
}
