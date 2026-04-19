import { z } from 'zod'
import { defineTool } from '../tool.js'
import { validateFileOperation, truncateOutput, sanitizePath, expandHome } from '../permission.js'
import fs from 'fs'
import path from 'path'
import { decodeTextBuffer } from '../text.js'
import { ensureNotAborted, writeTextFileWithRetry } from '../file.js'

const parameters = z.object({
  filePath: z.string().describe('The absolute or working-directory-relative path to the file to modify'),
  oldString: z.string().describe('The text to replace'),
  newString: z.string().describe('The text to replace it with (must be different from oldString)'),
  replaceAll: z.boolean().optional().describe('Replace all occurrences (default false)')
})

export const editTool = defineTool('edit', {
  description: `Edit an existing file by finding and replacing specific text.

Behavior:
- Finds exact text matches (case-sensitive, whitespace-sensitive)
- Replaces only the first match by default, use replaceAll for all occurrences
- Automatically handles line ending differences (CRLF/LF)
- Can create a new file if oldString is empty and file doesn't exist

IMPORTANT: You MUST read the file first using the 'read' tool before editing.
This ensures you understand the current content and can make informed changes.

Parameters:
- filePath: Absolute or relative path to the file to modify
- oldString: The exact text to find and replace (must match exactly)
- newString: The replacement text (must be different from oldString)
- replaceAll: Set to true to replace all occurrences (default: false)

Returns success message with diff summary, or error if oldString not found.

Tips:
- Include surrounding context in oldString to make it unique
- If multiple matches exist without replaceAll, an error is thrown`,
  parameters,
  async execute(args, ctx) {
    const { filePath, oldString, newString, replaceAll = false } = args
    ensureNotAborted(ctx.abort)
    
    if (oldString === newString) {
      throw new Error('oldString and newString are identical, no changes needed')
    }
    
    const expandedPath = expandHome(filePath)
    const absolutePath = sanitizePath(expandedPath, ctx.workingDirectory)
    
    const validation = validateFileOperation('write', absolutePath, ctx.workingDirectory)
    if (!validation.allowed) {
      throw new Error(validation.reason)
    }
    
    const approved = await ctx.askPermission({
      permission: 'edit',
      patterns: [absolutePath],
      metadata: { filePath: absolutePath, oldLength: oldString.length, newLength: newString.length }
    })
    
    if (!approved) {
      throw new Error('Edit operation denied by user')
    }

    ensureNotAborted(ctx.abort)
    
    if (oldString === '') {
      const dir = path.dirname(absolutePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      await writeTextFileWithRetry(absolutePath, newString, ctx.abort)
      
      return {
        title: path.basename(absolutePath),
        output: `File created: ${absolutePath}\nSize: ${newString.length} bytes`
      }
    }
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }
    
    const content = decodeTextBuffer(fs.readFileSync(absolutePath))
    const matchString = resolveEditMatch(content, oldString)

    if (!matchString) {
      throw new Error(`Could not find oldString in file. Make sure it matches exactly including whitespace.`)
    }

    const replacement = matchString.includes('\r\n')
      ? newString.replace(/\r?\n/g, '\r\n')
      : newString.replace(/\r\n/g, '\n')
    const occurrences = countOccurrences(content, matchString)
    
    if (occurrences > 1 && !replaceAll) {
      throw new Error(`Found ${occurrences} occurrences of oldString. Use replaceAll=true to replace all, or provide more context to make it unique.`)
    }
    
    const newContent = replaceAll 
      ? content.split(matchString).join(replacement)
      : content.replace(matchString, replacement)
    
    ensureNotAborted(ctx.abort)
    await writeTextFileWithRetry(absolutePath, newContent, ctx.abort)
    
    const diff = createDiff(content, newContent)
    
    return {
      title: path.basename(absolutePath),
      output: `Edit applied successfully to: ${absolutePath}\n${diff}`
    }
  }
})

function countOccurrences(content: string, search: string): number {
  let count = 0
  let pos = 0
  while ((pos = content.indexOf(search, pos)) !== -1) {
    count++
    pos += search.length
  }
  return count
}

function createDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  
  const additions = newLines.length - oldLines.length
  const changes = Math.abs(additions) || countChangedLines(oldLines, newLines)
  
  let summary = `Lines changed: ${changes}`
  if (additions > 0) summary += ` (+${additions} lines)`
  if (additions < 0) summary += ` (${additions} lines)`
  
  return summary
}

function countChangedLines(oldLines: string[], newLines: string[]): number {
  let changed = 0
  const maxLen = Math.max(oldLines.length, newLines.length)
  
  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) {
      changed++
    }
  }
  
  return changed
}

function resolveEditMatch(content: string, oldString: string): string | null {
  const variants = [
    oldString,
    oldString.replace(/\n/g, '\r\n'),
    oldString.replace(/\r\n/g, '\n')
  ]

  for (const variant of Array.from(new Set(variants))) {
    if (variant && content.includes(variant)) {
      return variant
    }
  }

  return null
}
