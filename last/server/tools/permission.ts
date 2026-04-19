import path from 'path'
import fs from 'fs'
import os from 'os'

export interface PermissionRule {
  permission: string
  pattern: string
  action: 'allow' | 'deny' | 'ask'
}

export interface PermissionConfig {
  rules: PermissionRule[]
  allowedDirectories: string[]
  deniedPatterns: string[]
  maxFileSize: number
  maxOutputLength: number
  commandTimeout: number
  allowedCommands: string[]
  deniedCommands: string[]
}

const DEFAULT_CONFIG: PermissionConfig = {
  rules: [],
  allowedDirectories: [],
  deniedPatterns: [
    '**/.env*',
    '**/id_rsa*',
    '**/id_ed25519*',
    '**/.pem',
    '**/.key',
    '**/credentials*',
    '**/secrets*'
  ],
  maxFileSize: 10 * 1024 * 1024,
  maxOutputLength: 500000,
  commandTimeout: 60000,
  allowedCommands: [],
  deniedCommands: [
    'rm -rf /',
    'rm -rf ~',
    'rm -rf *',
    'rm -rf .',
    'mkfs',
    'dd if=',
    ':(){:|:&};:',
    'chmod -R 777 /',
    'chown -R',
    '> /dev/sda',
    '> /dev/sdb',
    '> /dev/hda',
    'mv /* /dev/null',
    'nc -e',
    'nc --exec',
    'ncat -e',
    'ncat --exec',
    '/dev/tcp/',
    '/dev/udp/',
    'curl.*-o.*\\|',
    'wget.*-o.*\\|',
    'python.*-c.*exec',
    'python.*-c.*eval',
    'node.*-e.*eval',
    'bash -i',
    'sh -i',
    'zsh -i',
    'exec /bin/',
    'exec /usr/',
    '> /etc/',
    '2> /etc/',
    'chmod +x /',
    'chmod 777 /',
    'ln -s / /',
    'mount --bind',
    'unset HISTFILE',
    'export HISTFILE=0',
    'history -c',
    '> ~/.bash_history',
    'curl file://',
    'wget file://',
    'gopher://',
    'dict://',
    'sftp://',
    'scp://'
  ]
}

let config: PermissionConfig = { ...DEFAULT_CONFIG }

export function setPermissionConfig(newConfig: Partial<PermissionConfig>) {
  config = { ...DEFAULT_CONFIG, ...newConfig }
}

export function getPermissionConfig(): PermissionConfig {
  return config
}

export function isPathAllowed(filePath: string, workingDirectory: string): boolean {
  const absolutePath = path.resolve(workingDirectory, filePath)
  const normalizedPath = path.normalize(absolutePath)
  
  if (config.allowedDirectories.length > 0) {
    const isAllowed = config.allowedDirectories.some(dir => {
      const normalizedDir = path.normalize(path.resolve(dir))
      return normalizedPath.startsWith(normalizedDir)
    })
    if (!isAllowed) return false
  }
  
  for (const pattern of config.deniedPatterns) {
    if (matchPattern(normalizedPath, pattern)) {
      return false
    }
  }
  
  return true
}

export function isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
  const trimmedCommand = command.trim()
  const lowerCommand = trimmedCommand.toLowerCase()
  
  for (const denied of config.deniedCommands) {
    if (lowerCommand.includes(denied.toLowerCase())) {
      return { allowed: false, reason: `Command contains blocked pattern: ${denied}` }
    }
  }
  
  const dangerousPatterns: { pattern: RegExp; reason: string }[] = [
    { pattern: /\|\s*(bash|sh|zsh|ksh|csh|tcsh|sh)\s*$/i, reason: 'Pipe to shell execution' },
    { pattern: /^\s*(curl|wget).*\|\s*(bash|sh|zsh|ksh|csh|tcsh|perl|python|ruby|php)\s*$/im, reason: 'Download and pipe to shell' },
    { pattern: /^\s*(curl|wget).*-o\s+[^\s]+\s*\|/i, reason: 'Download to file and pipe to shell' },
    { pattern: /\b(nc|netcat|ncat)\s+.*(-e|--exec|-c|--cmd)\b/i, reason: 'Netcat reverse shell pattern' },
    { pattern: /\bpython\d*\s+(-c|-m)\s+/i, reason: 'Python inline code execution' },
    { pattern: /\bnode\s+(-e|--eval|-p|--print)\s+/i, reason: 'Node inline code execution' },
    { pattern: /\bperl\s+(-e|-M)\s+/i, reason: 'Perl inline code execution' },
    { pattern: /\bruby\s+(-e|-r)\s+/i, reason: 'Ruby inline code execution' },
    { pattern: /\bphp\s+(-r|--run)\s+/i, reason: 'PHP inline code execution' },
    { pattern: /\bbash\s+(-c|--command)\s+/i, reason: 'Explicit bash command execution' },
    { pattern: /\bsh\s+(-c|--command)\s+/i, reason: 'Explicit sh command execution' },
    { pattern: /\bzsh\s+(-c|--command)\s+/i, reason: 'Explicit zsh command execution' },
    { pattern: /\$\([^)]{3,}\)/i, reason: 'Command substitution $(...)' },
    { pattern: /`[^`]{3,}`/i, reason: 'Command substitution backticks' },
    { pattern: /;\s*(rm|curl|wget|nc|bash|sh|chmod|chown|mkfs|dd)\s+/i, reason: 'Command chaining with dangerous command' },
    { pattern: /&&\s*(rm|curl|wget|nc|bash|sh|chmod|chown|mkfs|dd)\s+/i, reason: 'AND chaining with dangerous command' },
    { pattern: /\|\|\s*(rm|curl|wget|nc|bash|sh|chmod|chown|mkfs|dd)\s+/i, reason: 'OR chaining with dangerous command' },
    { pattern: />\s*\/dev\/(sda|sdb|sdc|hda|hdb|null)/i, reason: 'Direct output to device' },
    { pattern: /2>\s*\/dev\/(sda|sdb|sdc|hda|hdb|null)/i, reason: 'Direct stderr to device' },
    { pattern: /\x00/, reason: 'Null byte injection' },
    { pattern: /\\n|\\r|\\x0a|\\x0d/i, reason: 'Escaped newline injection' },
    { pattern: /\{\s*.*\|.*\}\s*:\s*\{.*\|.*\};:/i, reason: 'Fork bomb pattern' },
    { pattern: /eval\s*\(/i, reason: 'Eval function usage' },
    { pattern: /exec\s+(bash|sh|zsh|ksh|csh|tcsh)\s*/i, reason: 'Exec to shell' },
    { pattern: /\.(bashrc|bash_profile|profile|zshrc)\s*>/i, reason: 'RC file modification' },
    { pattern: /\/etc\/passwd|,etc\/group/, reason: 'System file modification' },
    { pattern: /chmod\s+(\d{3,4}|[0-7]{3,4})\s+(\/|[a-zA-Z])/i, reason: 'Suspicious chmod' },
    { pattern: /wget\s+.*(--post-data|--body-data)/i, reason: 'Wget POST data exfiltration' },
    { pattern: /curl\s+.*(-d|--data|--data-binary|--form)/i, reason: 'Curl data exfiltration' },
  ]
  
  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(trimmedCommand)) {
      return { allowed: false, reason: `Dangerous pattern detected: ${reason}` }
    }
  }
  
  if (config.allowedCommands.length > 0) {
    const cmdName = lowerCommand.split(/\s+/)[0]
    const isAllowed = config.allowedCommands.some(allowed => 
      cmdName === allowed.toLowerCase() || lowerCommand.startsWith(allowed.toLowerCase() + ' ')
    )
    if (!isAllowed) {
      return { allowed: false, reason: `Command not in allowed list: ${cmdName}` }
    }
  }
  
  return { allowed: true }
}

export function isFileSizeAllowed(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath)
    return stats.size <= config.maxFileSize
  } catch {
    return true
  }
}

export function truncateOutput(output: string): string {
  if (output.length <= config.maxOutputLength) {
    return output
  }
  return output.slice(0, config.maxOutputLength) + 
    `\n\n... (output truncated, ${output.length - config.maxOutputLength} characters omitted)`
}

export function resolveWorkingDirectory(workingDirectory?: string): string {
  const input = workingDirectory?.trim()
  if (!input) {
    return path.normalize(process.cwd())
  }
  const expanded = expandHome(input)
  if (path.isAbsolute(expanded)) {
    return path.normalize(expanded)
  }
  return path.normalize(path.resolve(process.cwd(), expanded))
}

export function sanitizePath(inputPath: string, workingDirectory: string): string {
  const normalizedWorkingDir = resolveWorkingDirectory(workingDirectory)
  const expandedPath = expandHome(inputPath)
  if (path.isAbsolute(expandedPath)) {
    return path.normalize(expandedPath)
  }
  return path.normalize(path.resolve(normalizedWorkingDir, expandedPath))
}

export function expandHome(filePath: string): string {
  if (filePath === '~') return os.homedir()
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    return path.join(os.homedir(), filePath.slice(2))
  }
  return filePath
}

function matchPattern(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const regex = patternToRegex(pattern)
  return regex.test(normalizedPath)
}

function patternToRegex(pattern: string): RegExp {
  let regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<<DOUBLE_STAR>>>')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/<<<DOUBLE_STAR>>>/g, '.*')
    .replace(/\?/g, '[^/\\\\]')
  
  return new RegExp(`^${regexStr}$`, 'i')
}

export function checkSensitiveFile(filePath: string): boolean {
  const sensitivePatterns = [
    /\.env$/i,
    /\.env\./i,
    /credentials/i,
    /secrets/i,
    /password/i,
    /token/i,
    /api[_-]?key/i,
    /private[_-]?key/i,
    /\.pem$/i,
    /\.key$/i,
    /id_rsa/i,
    /id_ed25519/i,
    /\.gitconfig$/i,
    /\.npmrc$/i,
    /_netrc$/i,
    /\.netrc$/i
  ]
  
  const basename = path.basename(filePath).toLowerCase()
  return sensitivePatterns.some(p => p.test(basename))
}

export function validateFileOperation(
  operation: 'read' | 'write' | 'delete',
  filePath: string,
  workingDirectory: string
): { allowed: boolean; reason?: string } {
  try {
    const sanitized = sanitizePath(filePath, workingDirectory)
    
    if (!isPathAllowed(sanitized, workingDirectory)) {
      return { allowed: false, reason: `Path not allowed: ${filePath}` }
    }
    
    if (checkSensitiveFile(sanitized)) {
      return { allowed: false, reason: `Sensitive file detected: ${filePath}` }
    }
    
    if (operation === 'read' && fs.existsSync(sanitized)) {
      if (!isFileSizeAllowed(sanitized)) {
        return { allowed: false, reason: `File too large: ${filePath}` }
      }
    }
    
    return { allowed: true }
  } catch (error) {
    return { allowed: false, reason: (error as Error).message }
  }
}
