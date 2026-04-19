import { z } from 'zod'
import { defineTool } from '../tool.js'
import { validateFileOperation, truncateOutput, sanitizePath, expandHome } from '../permission.js'
import fs from 'fs'
import path from 'path'
import { decodeTextBuffer, splitLines } from '../text.js'

const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const MAX_BYTES = 50 * 1024

const parameters = z.object({
  filePath: z.string().describe('The absolute or working-directory-relative path to the file or directory to read'),
  offset: z.number().optional().describe('The line number to start reading from (1-indexed)'),
  limit: z.number().optional().describe('The maximum number of lines to read (defaults to 2000)')
})

export const readTool = defineTool('read', {
  description: `Read a file or list directory contents from the local filesystem.

For files:
- Returns file contents with line numbers (1-indexed)
- Supports reading specific line ranges using offset and limit parameters
- Automatically detects and rejects binary files (images, executables, etc.)
- Long lines (>2000 chars) are truncated with a marker
- Output is capped at 50KB for performance

For directories:
- Lists all entries sorted (directories first, then alphabetically)
- Shows entry count and pagination info

Parameters:
- filePath: Absolute or relative path to file/directory
- offset: Starting line number for files (default: 1)
- limit: Maximum lines to read (default: 2000)

Returns structured output with path, type, and content/entries.`,
  parameters,
  async execute(args, ctx) {
    const { filePath, offset = 1, limit = DEFAULT_READ_LIMIT } = args
    
    const expandedPath = expandHome(filePath)
    const absolutePath = sanitizePath(expandedPath, ctx.workingDirectory)
    
    const validation = validateFileOperation('read', absolutePath, ctx.workingDirectory)
    if (!validation.allowed) {
      throw new Error(validation.reason)
    }
    
    const approved = await ctx.askPermission({
      permission: 'read',
      patterns: [absolutePath],
      metadata: { filePath: absolutePath }
    })
    
    if (!approved) {
      throw new Error('Read operation denied by user')
    }
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }
    
    const stats = fs.statSync(absolutePath)
    
    if (stats.isDirectory()) {
      return readDirectory(absolutePath, offset, limit)
    }
    
    if (isBinaryFile(absolutePath)) {
      throw new Error(`Cannot read binary file: ${absolutePath}`)
    }
    
    return readFile(absolutePath, offset, limit)
  }
})

async function readDirectory(dirPath: string, offset: number, limit: number): Promise<{ title: string; output: string }> {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .map(entry => ({
      name: entry.name + (entry.isDirectory() ? '/' : ''),
      isDir: entry.isDirectory()
    }))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  
  const start = offset - 1
  const sliced = entries.slice(start, start + limit)
  const truncated = start + sliced.length < entries.length
  
  let output = `<path>${dirPath}</path>\n<type>directory</type>\n<entries>\n`
  output += sliced.map(e => e.name).join('\n')
  
  if (truncated) {
    output += `\n\n(Showing ${sliced.length} of ${entries.length} entries. Use offset parameter to read more.)`
  } else {
    output += `\n\n(${entries.length} entries)`
  }
  output += '\n</entries>'
  
  return {
    title: path.basename(dirPath),
    output
  }
}

async function readFile(filePath: string, offset: number, limit: number): Promise<{ title: string; output: string }> {
  const content = decodeTextBuffer(fs.readFileSync(filePath))
  const lines = splitLines(content)
  const raw: string[] = []
  let bytes = 0
  let cut = false
  const start = Math.max(offset - 1, 0)
  const end = Math.min(start + limit, lines.length)
  
  for (let index = start; index < end; index++) {
    const text = lines[index]
    const line = text.length > MAX_LINE_LENGTH
      ? text.substring(0, MAX_LINE_LENGTH) + '... (truncated)'
      : text
    const size = Buffer.byteLength(line, 'utf-8') + (raw.length > 0 ? 1 : 0)
    
    if (bytes + size > MAX_BYTES) {
      cut = true
      break
    }
    
    raw.push(line)
    bytes += size
  }
  
  let output = `<path>${filePath}</path>\n<type>file</type>\n<content>\n`
  output += raw.map((line, i) => `${i + offset}: ${line}`).join('\n')
  
  const last = offset + raw.length - 1
  const next = last + 1
  const more = end < lines.length || cut
  const count = lines.length
  
  if (cut) {
    output += `\n\n(Output capped at 50KB. Showing lines ${offset}-${last}. Use offset=${next} to continue.)`
  } else if (more) {
    output += `\n\n(Showing lines ${offset}-${last} of ${count}. Use offset=${next} to continue.)`
  } else {
    output += `\n\n(End of file - total ${count} lines)`
  }
  output += '\n</content>'
  
  return {
    title: path.basename(filePath),
    output: truncateOutput(output)
  }
}

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  const binaryExts = [
    '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.class', '.jar',
    '.war', '.7z', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.odt', '.ods', '.odp', '.bin', '.dat', '.obj', '.o', '.a', '.lib',
    '.wasm', '.pyc', '.pyo', '.png', '.jpg', '.jpeg', '.gif', '.bmp',
    '.ico', '.webp', '.mp3', '.mp4', '.wav', '.avi', '.mov', '.pdf'
  ]
  
  if (binaryExts.includes(ext)) return true
  
  const fd = fs.openSync(filePath, 'r')
  const buffer = Buffer.alloc(8192)
  const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0)
  fs.closeSync(fd)
  
  if (bytesRead === 0) return false
  
  for (let i = 0; i < bytesRead; i++) {
    if (buffer[i] === 0) return true
  }
  
  return false
}
