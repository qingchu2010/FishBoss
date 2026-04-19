import { z } from 'zod'
import { defineTool } from '../tool.js'
import { sanitizePath, expandHome, truncateOutput } from '../permission.js'
import fs from 'fs'
import path from 'path'

const parameters = z.object({
  pattern: z.string().describe('The glob pattern to match files against (e.g., "**/*.ts")'),
  path: z.string().optional().describe('The absolute or working-directory-relative directory to search in (defaults to the working directory)')
})

export const globTool = defineTool('glob', {
  description: `Find files matching a glob pattern in a directory.

Features:
- Supports standard glob patterns: "*", "**", "?"
- Common patterns: "**/*.ts", "src/**/*.js", "*.json", "lib/**"
- Returns absolute file paths sorted by modification time (newest first)
- Results limited to 100 files for performance

Parameters:
- pattern: The glob pattern to match (e.g., "**/*.ts")
- path: Directory to search in (defaults to working directory)

Returns list of matching file paths, or "No files found".

Pattern syntax:
- * matches any sequence of characters (except /)
- ** matches any sequence of characters including /
- ? matches any single character
- Example: "src/**/*.test.ts" finds all test files in src`,
  parameters,
  async execute(args, ctx) {
    const { pattern, path: searchPath } = args
    
    const searchDir = searchPath 
      ? sanitizePath(expandHome(searchPath), ctx.workingDirectory)
      : ctx.workingDirectory
    
    const approved = await ctx.askPermission({
      permission: 'glob',
      patterns: [pattern],
      metadata: { pattern, path: searchDir }
    })
    
    if (!approved) {
      throw new Error('Glob operation denied by user')
    }
    
    if (!fs.existsSync(searchDir)) {
      throw new Error(`Directory not found: ${searchDir}`)
    }
    
    const files = globSearch(searchDir, pattern)
    
    files.sort((a, b) => {
      const statA = fs.statSync(a)
      const statB = fs.statSync(b)
      return statB.mtime.getTime() - statA.mtime.getTime()
    })
    
    const limit = 100
    const truncated = files.length > limit
    const result = files.slice(0, limit)
    
    let output = result.join('\n')
    
    if (result.length === 0) {
      output = 'No files found'
    } else if (truncated) {
      output += `\n\n(Results truncated: showing ${limit} of ${files.length} files. Use a more specific pattern.)`
    } else {
      output += `\n\n(${files.length} files found)`
    }
    
    return {
      title: pattern,
      output: truncateOutput(output)
    }
  }
})

function globSearch(dir: string, pattern: string): string[] {
  const results: string[] = []
  const parts = pattern.split(/(?<!\*\*)\//)
  
  function walk(currentDir: string, patternParts: string[]) {
    if (!fs.existsSync(currentDir)) return
    
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    
    if (patternParts.length === 0) {
      results.push(currentDir)
      return
    }
    
    const currentPattern = patternParts[0]
    const remainingPatterns = patternParts.slice(1)
    
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name)
      
      if (entry.isDirectory()) {
        if (currentPattern === '**') {
          walk(entryPath, patternParts)
          walk(entryPath, remainingPatterns)
        } else if (matchPattern(entry.name, currentPattern)) {
          walk(entryPath, remainingPatterns)
        }
      } else if (entry.isFile()) {
        if (remainingPatterns.length === 0 && matchPattern(entry.name, currentPattern)) {
          results.push(entryPath)
        }
      }
    }
  }
  
  if (parts.length === 1) {
    walk(dir, parts)
  } else {
    walk(dir, parts)
  }
  
  return results
}

function matchPattern(name: string, pattern: string): boolean {
  if (pattern === '*') return true
  if (pattern === '**') return true
  
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  
  const regex = new RegExp(`^${regexStr}$`, 'i')
  return regex.test(name)
}
