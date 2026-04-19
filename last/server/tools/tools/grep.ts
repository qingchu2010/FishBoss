import { z } from 'zod'
import { defineTool } from '../tool.js'
import { sanitizePath, expandHome, truncateOutput } from '../permission.js'
import fs from 'fs'
import path from 'path'
import { decodeTextBuffer, splitLines } from '../text.js'

const parameters = z.object({
  pattern: z.string().describe('The regex pattern to search for'),
  path: z.string().optional().describe('The absolute or working-directory-relative directory to search in (defaults to the working directory)'),
  glob: z.string().optional().describe('Glob pattern to filter files (e.g., "*.ts")'),
  ignoreCase: z.boolean().optional().describe('Case insensitive search (default false)'),
  maxResults: z.number().optional().describe('Maximum number of results (default 100)')
})

export const grepTool = defineTool('grep', {
  description: `Search for a regex pattern across multiple files in a directory.

Features:
- Recursively searches through all files in the directory
- Supports full JavaScript regex syntax for pattern matching
- Can filter files by glob pattern (e.g., "*.ts", "**/*.js")
- Returns matching lines with file paths and line numbers
- Automatically skips node_modules and .git directories

Parameters:
- pattern: The regex pattern to search for
- path: Directory to search in (defaults to working directory)
- glob: File pattern filter (e.g., "*.ts" for TypeScript files only)
- ignoreCase: Case-insensitive search (default: false)
- maxResults: Maximum results to return (default: 100)

Returns list of matches in "file:line: content" format, or "No matches found".

Tips:
- Use specific patterns to avoid too many results
- Combine with glob to narrow search scope`,
  parameters,
  async execute(args, ctx) {
    const { pattern, path: searchPath, glob, ignoreCase = false, maxResults = 100 } = args
    
    const searchDir = searchPath 
      ? sanitizePath(expandHome(searchPath), ctx.workingDirectory)
      : ctx.workingDirectory
    
    const approved = await ctx.askPermission({
      permission: 'grep',
      patterns: [pattern],
      metadata: { pattern, path: searchDir, glob }
    })
    
    if (!approved) {
      throw new Error('Grep operation denied by user')
    }
    
    if (!fs.existsSync(searchDir)) {
      throw new Error(`Directory not found: ${searchDir}`)
    }
    
    let regex: RegExp
    try {
      regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g')
    } catch (e) {
      throw new Error(`Invalid regex pattern: ${pattern}`)
    }
    
    const files = findFiles(searchDir, glob)
    const results: Array<{ file: string; line: number; content: string }> = []
    
    for (const file of files) {
      if (results.length >= maxResults) break
      
      try {
        const matches = await grepFile(file, regex, maxResults - results.length)
        results.push(...matches)
      } catch {
        continue
      }
    }
    
    let output = results
      .map(r => `${r.file}:${r.line}: ${r.content}`)
      .join('\n')
    
    if (results.length === 0) {
      output = 'No matches found'
    } else if (results.length >= maxResults) {
      output += `\n\n(Results limited to ${maxResults}. Use a more specific pattern.)`
    } else {
      output += `\n\n(${results.length} matches found)`
    }
    
    return {
      title: pattern,
      output: truncateOutput(output)
    }
  }
})

function findFiles(dir: string, globPattern?: string): string[] {
  const results: string[] = []
  
  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return
    
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name)
      
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          walk(entryPath)
        }
      } else if (entry.isFile()) {
        if (!globPattern || matchGlob(entry.name, globPattern)) {
          results.push(entryPath)
        }
      }
    }
  }
  
  walk(dir)
  return results
}

function matchGlob(name: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  
  const regex = new RegExp(`^${regexStr}$`, 'i')
  return regex.test(name)
}

async function grepFile(
  filePath: string, 
  regex: RegExp, 
  maxMatches: number
): Promise<Array<{ file: string; line: number; content: string }>> {
  const results: Array<{ file: string; line: number; content: string }> = []
  const content = decodeTextBuffer(fs.readFileSync(filePath))
  const lines = splitLines(content)

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    if (regex.test(line)) {
      regex.lastIndex = 0
      results.push({
        file: filePath,
        line: index + 1,
        content: line.length > 200 ? line.slice(0, 200) + '...' : line
      })

      if (results.length >= maxMatches) {
        break
      }
    } else {
      regex.lastIndex = 0
    }
  }
  
  return results
}
