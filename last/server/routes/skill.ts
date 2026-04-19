import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { isIP, isIPv4 } from 'is-ip'
import { getConfigDir } from '../storage/index.js'

export const skillRouter = Router()

interface SkillInfo {
  name: string
  description: string
  location: string
  content: string
}

interface SkillFrontmatter {
  name: string
  description: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
}

interface IndexSkill {
  name: string
  files: string[]
}

interface SkillIndex {
  skills: IndexSkill[]
}

function isPrivateIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const parts = ip.split('.').map(Number)
    if (parts[0] === 10) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (ip === '127.0.0.1') return true
  }
  return false
}

function validateUrlForSSRF(inputUrl: string): { valid: boolean; error?: string } {
  let url: URL
  try {
    url = new URL(inputUrl)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  if (url.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are allowed' }
  }

  const hostname = url.hostname
  if (hostname === 'localhost') {
    return { valid: false, error: 'Localhost is not allowed' }
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { valid: false, error: 'Private IP addresses are not allowed' }
    }
  }

  return { valid: true }
}

const SKILL_DIRS = [
  path.join(os.homedir(), '.fishboss', 'skills'),
  path.join(os.homedir(), '.claude', 'skills'),
  path.join(os.homedir(), '.agents', 'skills'),
]

function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter | null; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!match) {
    return { frontmatter: null, body: content }
  }

  try {
    const frontmatterLines = match[1].split('\n')
    const frontmatter: Record<string, any> = {}
    let currentKey = ''
    let inMetadata = false
    const metadata: Record<string, string> = {}

    for (const line of frontmatterLines) {
      if (line.startsWith('metadata:')) {
        inMetadata = true
        currentKey = 'metadata'
        continue
      }

      if (inMetadata) {
        const metaMatch = line.match(/^\s+(\w+):\s*(.*)$/)
        if (metaMatch) {
          metadata[metaMatch[1]] = metaMatch[2]
          continue
        }
        inMetadata = false
      }

      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        currentKey = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        frontmatter[currentKey] = value
      }
    }

    if (Object.keys(metadata).length > 0) {
      frontmatter.metadata = metadata
    }

    return {
      frontmatter: frontmatter as SkillFrontmatter,
      body: match[2]
    }
  } catch {
    return { frontmatter: null, body: content }
  }
}

function validateSkillName(name: string): boolean {
  const regex = /^[a-z0-9]+(-[a-z0-9]+)*$/
  return regex.test(name) && name.length >= 1 && name.length <= 64
}

function scanSkillsDir(dir: string): SkillInfo[] {
  const skills: SkillInfo[] = []

  if (!fs.existsSync(dir)) {
    return skills
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const skillPath = path.join(dir, entry.name)
    const skillMdPath = path.join(skillPath, 'SKILL.md')

    if (!fs.existsSync(skillMdPath)) continue

    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8')
      const { frontmatter, body } = parseFrontmatter(content)

      if (!frontmatter || !frontmatter.name || !frontmatter.description) {
        continue
      }

      if (!validateSkillName(frontmatter.name)) {
        continue
      }

      if (frontmatter.name !== entry.name) {
        continue
      }

      skills.push({
        name: frontmatter.name,
        description: frontmatter.description,
        location: skillMdPath,
        content: body.trim()
      })
    } catch {
      continue
    }
  }

  return skills
}

function getAllSkills(): SkillInfo[] {
  const allSkills: Map<string, SkillInfo> = new Map()

  for (const dir of SKILL_DIRS) {
    const skills = scanSkillsDir(dir)
    for (const skill of skills) {
      if (!allSkills.has(skill.name)) {
        allSkills.set(skill.name, skill)
      }
    }
  }

  return Array.from(allSkills.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function getSkillFiles(skillDir: string): string[] {
  const files: string[] = []

  if (!fs.existsSync(skillDir)) {
    return files
  }

  const scanDir = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDir(fullPath)
      } else if (entry.name !== 'SKILL.md') {
        files.push(fullPath)
      }
    }
  }

  scanDir(skillDir)
  return files.slice(0, 10)
}

skillRouter.get('/', (req, res) => {
  const skills = getAllSkills()
  res.json({ skills })
})

skillRouter.get('/:name', (req, res) => {
  const { name } = req.params
  const skills = getAllSkills()
  const skill = skills.find(s => s.name === name)

  if (!skill) {
    return res.status(404).json({ error: `Skill "${name}" not found` })
  }

  const skillDir = path.dirname(skill.location)
  const files = getSkillFiles(skillDir)

  res.json({
    ...skill,
    files,
    baseUrl: `file://${skillDir}`
  })
})

skillRouter.post('/', (req, res) => {
  const { name, description, content } = req.body

  if (!name || !description) {
    return res.status(400).json({ error: 'name and description are required' })
  }

  if (!validateSkillName(name)) {
    return res.status(400).json({ error: 'Invalid skill name. Must be lowercase alphanumeric with hyphens, 1-64 characters' })
  }

  const skillDir = path.join(getConfigDir(), 'skills', name)
  const skillMdPath = path.join(skillDir, 'SKILL.md')

  if (fs.existsSync(skillMdPath)) {
    return res.status(400).json({ error: `Skill "${name}" already exists` })
  }

  try {
    fs.mkdirSync(skillDir, { recursive: true })

    const frontmatter = `---
name: ${name}
description: ${description}
---

${content || ''}`

    fs.writeFileSync(skillMdPath, frontmatter, 'utf-8')

    res.json({
      success: true,
      skill: {
        name,
        description,
        location: skillMdPath,
        content: content || ''
      }
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

skillRouter.put('/:name', (req, res) => {
  const { name } = req.params
  const { description, content } = req.body

  const skills = getAllSkills()
  const skill = skills.find(s => s.name === name)

  if (!skill) {
    return res.status(404).json({ error: `Skill "${name}" not found` })
  }

  const skillMdPath = skill.location

  try {
    const frontmatter = `---
name: ${name}
description: ${description || skill.description}
---

${content || ''}`

    fs.writeFileSync(skillMdPath, frontmatter, 'utf-8')

    res.json({
      success: true,
      skill: {
        name,
        description: description || skill.description,
        location: skillMdPath,
        content: content || ''
      }
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

skillRouter.delete('/:name', (req, res) => {
  const { name } = req.params
  const skills = getAllSkills()
  const skill = skills.find(s => s.name === name)

  if (!skill) {
    return res.status(404).json({ error: `Skill "${name}" not found` })
  }

  const skillDir = path.dirname(skill.location)

  if (!skillDir.startsWith(getConfigDir())) {
    return res.status(400).json({ error: 'Cannot delete skill from external directory' })
  }

  try {
    fs.rmSync(skillDir, { recursive: true, force: true })
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

skillRouter.get('/dirs', (req, res) => {
  const dirs = SKILL_DIRS.filter(dir => fs.existsSync(dir))
  res.json({ dirs })
})

skillRouter.post('/import', async (req, res) => {
  const { url } = req.body

  if (!url) {
    return res.status(400).json({ error: 'url is required' })
  }

  const validation = validateUrlForSSRF(url)
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error })
  }

  try {
    const baseUrl = url.endsWith('/') ? url : `${url}/`
    const indexUrl = new URL('index.json', baseUrl).href

    const indexResponse = await axios.get<SkillIndex>(indexUrl, {
      timeout: 10000,
      maxContentLength: 5 * 1024 * 1024
    })
    const indexData = indexResponse.data

    if (!indexData.skills || !Array.isArray(indexData.skills)) {
      return res.status(400).json({ error: 'Invalid index.json format' })
    }

    const importedSkills: string[] = []
    const errors: string[] = []
    const skillCacheDir = path.join(getConfigDir(), 'skills')

    for (const skill of indexData.skills) {
      if (!skill.name || !skill.files || !skill.files.includes('SKILL.md')) {
        errors.push(`Skill "${skill.name || 'unknown'}" is missing SKILL.md`)
        continue
      }

      const skillDir = path.join(skillCacheDir, skill.name)

      try {
        fs.mkdirSync(skillDir, { recursive: true })

        for (const file of skill.files) {
          const fileUrl = new URL(file, `${baseUrl}${skill.name}/`).href
          const filePath = path.join(skillDir, file)

          const fileDir = path.dirname(filePath)
          fs.mkdirSync(fileDir, { recursive: true })

          const fileResponse = await axios.get(fileUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            maxContentLength: 10 * 1024 * 1024
          })
          fs.writeFileSync(filePath, Buffer.from(fileResponse.data))
        }

        importedSkills.push(skill.name)
      } catch (err: any) {
        errors.push(`Failed to import "${skill.name}": ${err.message}`)
      }
    }

    res.json({
      success: true,
      imported: importedSkills,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('Import error:', error)
    res.status(500).json({ error: error.response?.data?.error || error.message })
  }
})

skillRouter.post('/import-zip', async (req, res) => {
  const { data } = req.body

  if (!data) {
    return res.status(400).json({ error: 'zip data is required (base64 encoded)' })
  }

  try {
    const buffer = Buffer.from(data, 'base64')
    const zip = new AdmZip(buffer)
    const zipEntries = zip.getEntries()

    const importedSkills: string[] = []
    const errors: string[] = []
    const skillCacheDir = path.join(getConfigDir(), 'skills')

    const skillDirs = new Set<string>()

    for (const entry of zipEntries) {
      const entryPath = entry.entryName
      const parts = entryPath.split('/')

      if (parts.length >= 2) {
        const skillName = parts[0]
        if (skillName && validateSkillName(skillName)) {
          skillDirs.add(skillName)
        }
      }
    }

    for (const skillName of skillDirs) {
      const skillMdPath = `${skillName}/SKILL.md`
      const skillMdEntry = zipEntries.find(e => e.entryName === skillMdPath || e.entryName.startsWith(skillMdPath))

      if (!skillMdEntry) {
        errors.push(`Skill "${skillName}" is missing SKILL.md`)
        continue
      }

      const skillDir = path.join(skillCacheDir, skillName)

      try {
        fs.mkdirSync(skillDir, { recursive: true })

        for (const entry of zipEntries) {
          if (entry.entryName.startsWith(`${skillName}/`) && !entry.isDirectory) {
            const relativePath = entry.entryName.slice(skillName.length + 1)
            const filePath = path.join(skillDir, relativePath)

            const fileDir = path.dirname(filePath)
            fs.mkdirSync(fileDir, { recursive: true })

            const content = entry.getData()
            fs.writeFileSync(filePath, content)
          }
        }

        const skillMdFullPath = path.join(skillDir, 'SKILL.md')
        if (fs.existsSync(skillMdFullPath)) {
          const mdContent = fs.readFileSync(skillMdFullPath, 'utf-8')
          const { frontmatter } = parseFrontmatter(mdContent)

          if (!frontmatter || !frontmatter.name || !frontmatter.description) {
            errors.push(`Skill "${skillName}" has invalid SKILL.md format`)
            fs.rmSync(skillDir, { recursive: true, force: true })
            continue
          }

          importedSkills.push(skillName)
        } else {
          errors.push(`Skill "${skillName}" SKILL.md extraction failed`)
          fs.rmSync(skillDir, { recursive: true, force: true })
        }
      } catch (err: any) {
        errors.push(`Failed to import "${skillName}": ${err.message}`)
      }
    }

    res.json({
      success: true,
      imported: importedSkills,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('Import zip error:', error)
    res.status(500).json({ error: error.message })
  }
})
