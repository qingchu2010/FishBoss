import { z } from 'zod'
import { defineTool } from '../tool.js'
import { validateFileOperation, truncateOutput, sanitizePath, expandHome } from '../permission.js'
import fs from 'fs/promises'
import path from 'path'
import { ensureNotAborted, writeTextFileWithRetry } from '../file.js'

const parameters = z.object({
  filePath: z.string().describe('The absolute or working-directory-relative path to the file to write'),
  content: z.string().describe('The content to write to the file')
})

export const writeTool = defineTool('write', {
  description: `Write content to a new file on the local filesystem.

Behavior:
- Creates the file if it doesn't exist
- Automatically creates parent directories if needed
- FAILS if the file already exists - use 'edit' tool for existing files
- Overwrites are prevented to avoid accidental data loss

IMPORTANT: You MUST read the file first using the 'read' tool before writing.
This ensures you understand the current content and can make informed changes.

Parameters:
- filePath: Absolute or relative path for the new file
- content: The text content to write to the file

Returns success message with file path and size, or error if file exists.

CRITICAL: If the file already exists, you MUST use the 'edit' tool instead.`,
  parameters,
  async execute(args, ctx) {
    const { filePath, content } = args
    ensureNotAborted(ctx.abort)
    
    const expandedPath = expandHome(filePath)
    const absolutePath = sanitizePath(expandedPath, ctx.workingDirectory)
    
    const validation = validateFileOperation('write', absolutePath, ctx.workingDirectory)
    if (!validation.allowed) {
      throw new Error(validation.reason)
    }

    try {
      await fs.access(absolutePath)
      throw new Error(`File already exists: ${absolutePath}. Use the 'edit' tool to modify existing files.`)
    } catch (err: unknown) {
      if (err instanceof Error && !err.message.includes('File already exists')) {
        // File doesn't exist, continue
      } else {
        throw err
      }
    }

    const approved = await ctx.askPermission({
      permission: 'write',
      patterns: [absolutePath],
      metadata: { filePath: absolutePath, size: content.length }
    })
    
    if (!approved) {
      throw new Error('Write operation denied by user')
    }

    ensureNotAborted(ctx.abort)
    
    const dir = path.dirname(absolutePath)
    try {
      await fs.access(dir)
    } catch {
      await fs.mkdir(dir, { recursive: true })
    }
    
    await writeTextFileWithRetry(absolutePath, content, ctx.abort)
    
    const stats = await fs.stat(absolutePath)
    
    return {
      title: path.basename(absolutePath),
      output: `File written successfully: ${absolutePath}\nSize: ${stats.size} bytes`
    }
  }
})
