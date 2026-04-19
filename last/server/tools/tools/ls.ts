import { z } from 'zod'
import { defineTool } from '../tool.js'
import { sanitizePath, expandHome, truncateOutput } from '../permission.js'
import fs from 'fs'
import path from 'path'

const parameters = z.object({
  path: z.string().optional().describe('The directory path to list (defaults to the working directory)'),
  showHidden: z.boolean().optional().describe('Show hidden files (default false)')
})

export const lsTool = defineTool('ls', {
  description: `List directory contents in a formatted view.

Features:
- Shows all files and subdirectories
- Directories are marked with trailing /
- Displays file sizes for regular files
- Sorts entries: directories first, then alphabetically
- Can show hidden files (those starting with .)

Parameters:
- path: Directory path to list (defaults to working directory)
- showHidden: Include hidden files starting with . (default: false)

Returns structured output with path and entries list with sizes.

Note: If the path is a file, returns the file info instead.`,
  parameters,
  async execute(args, ctx) {
    const { path: dirPath = '.', showHidden = false } = args
    
    const absolutePath = sanitizePath(expandHome(dirPath), ctx.workingDirectory)
    
    const approved = await ctx.askPermission({
      permission: 'ls',
      patterns: [absolutePath],
      metadata: { path: absolutePath }
    })
    
    if (!approved) {
      throw new Error('List operation denied by user')
    }
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory not found: ${absolutePath}`)
    }
    
    const stats = fs.statSync(absolutePath)
    
    if (!stats.isDirectory()) {
      return {
        title: path.basename(absolutePath),
        output: `Not a directory: ${absolutePath}`
      }
    }
    
    const entries = fs.readdirSync(absolutePath, { withFileTypes: true })
      .filter(entry => showHidden || !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name + (entry.isDirectory() ? '/' : ''),
        isDir: entry.isDirectory(),
        size: entry.isFile() ? fs.statSync(path.join(absolutePath, entry.name)).size : 0
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    
    let output = `<path>${absolutePath}</path>\n<entries>\n`
  output += entries.map(e => {
    const sizeStr = e.isDir ? '' : ` (${formatSize(e.size)})`
    return `${e.name}${sizeStr}`
  }).join('\n')
  output += `\n</entries>\n\n(${entries.length} entries)`
  
  return {
    title: path.basename(absolutePath),
    output: truncateOutput(output)
  }
  }
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}
