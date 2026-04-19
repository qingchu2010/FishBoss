import { z } from 'zod'
import { defineTool } from '../tool.js'
import { isCommandAllowed, getPermissionConfig } from '../permission.js'
import { spawn } from 'child_process'
import { decodeTextBuffer } from '../text.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

const parameters = z.object({
  command: z.string().describe('The command to execute'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default 60000)'),
  workdir: z.string().optional().describe('Working directory for the command')
})

const MAX_LINES_IN_MEMORY = 500
const OUTPUT_DIR = path.join(os.homedir(), '.fishboss', 'outputs')

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

function saveOutputToFile(output: string, prefix: string): string {
  ensureOutputDir()
  const timestamp = Date.now()
  const filename = `${prefix.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_${timestamp}.txt`
  const filepath = path.join(OUTPUT_DIR, filename)
  fs.writeFileSync(filepath, output, 'utf-8')
  return filepath
}

function countLines(text: string): number {
  return text.split('\n').length
}

function getLastNLines(text: string, n: number): string {
  const lines = text.split('\n')
  if (lines.length <= n) {
    return text
  }
  return lines.slice(-n).join('\n')
}

export const bashTool = defineTool('bash', {
  description: `Execute a shell command in a terminal environment.

Features:
- Runs commands in the specified working directory (defaults to project root)
- Automatically uses PowerShell on Windows, Bash on Unix systems
- Large output (>500 lines) is saved to ~/.fishboss/outputs/ with a summary shown
- Dangerous commands (rm -rf /, format, etc.) are blocked for safety
- Supports command chaining with && for dependent operations
- Configurable timeout (default 60 seconds)

Parameters:
- command: The shell command to execute
- timeout: Maximum execution time in milliseconds (optional)
- workdir: Working directory for command execution (optional)

Returns the command output with exit code, or error message if failed.`,
  parameters,
  async execute(args, ctx) {
    const { command, timeout, workdir } = args
    
    const check = isCommandAllowed(command)
    if (!check.allowed) {
      throw new Error(`Command blocked: ${check.reason}`)
    }
    
    const cwd = workdir || ctx.workingDirectory
    const timeoutMs = timeout || getPermissionConfig().commandTimeout
    
    const approved = await ctx.askPermission({
      permission: 'bash',
      patterns: [command],
      metadata: { command, cwd }
    })
    
    if (!approved) {
      throw new Error('Command execution denied by user')
    }
    
    return new Promise((resolve, reject) => {
      const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
      const shellArgs = process.platform === 'win32' 
        ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '[Console]::InputEncoding = [System.Text.Encoding]::UTF8; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 > $null; ' + command]
        : ['-c', command]
      
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      
      const proc = spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true
      })
      
      const timer = setTimeout(() => {
        proc.kill()
        reject(new Error(`Command timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      
      proc.stdout.on('data', (data) => {
        stdoutChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data))
      })
      
      proc.stderr.on('data', (data) => {
        stderrChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data))
      })
      
      proc.on('close', (code) => {
        clearTimeout(timer)
        const output = decodeShellOutput(stdoutChunks)
        const errorOutput = decodeShellOutput(stderrChunks)
        
        const totalLines = countLines(output) + countLines(errorOutput)
        const maxLines = MAX_LINES_IN_MEMORY
        
        let result: string
        
        if (totalLines > maxLines) {
          const fullOutput = buildFullOutput(output, errorOutput, code)
          const outputFile = saveOutputToFile(fullOutput, 'bash_output')
          const lastLines = getLastNLines(fullOutput, maxLines)
          
          result = `[Output too large: ${totalLines} lines total]\n`
          result += `[Full output saved to: ${outputFile}]\n\n`
          result += `--- Last ${maxLines} lines ---\n`
          result += lastLines
        } else {
          result = buildFullOutput(output, errorOutput, code)
        }
        
        resolve({
          title: command.slice(0, 50),
          output: result
        })
      })
      
      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      
      if (ctx.abort) {
        ctx.abort.addEventListener('abort', () => {
          proc.kill()
          reject(new Error('Command aborted by user'))
        })
      }
    })
  }
})

function decodeShellOutput(chunks: Buffer[]): string {
  if (chunks.length === 0) {
    return ''
  }
  return decodeTextBuffer(Buffer.concat(chunks))
}

function buildFullOutput(stdout: string, stderr: string, code: number | null): string {
  let result = stdout
  if (stderr) {
    result += `\n[stderr]\n${stderr}`
  }
  if (code !== 0) {
    result += `\n[exit code: ${code}]`
  }
  return result
}
