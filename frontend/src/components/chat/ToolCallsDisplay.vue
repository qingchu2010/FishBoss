<template>
  <div class="tool-calls-display">
    <div v-for="tc in toolCalls" :key="tc.id" :class="['tool-call-item', tc.status]">
      <div class="tool-call-line">
        <span class="tool-call-marker">
          <Loader2 v-if="tc.status === 'pending' || tc.status === 'running'" :size="12" class="spin" />
          <X v-else-if="tc.status === 'error'" :size="12" />
          <Check v-else :size="12" />
        </span>
        <span class="tool-name">{{ tc.function.name }}</span>
        <span class="tool-colon">:</span>
        <span v-if="getPreview(tc)" class="tool-preview">{{ getPreview(tc) }}</span>
        <span v-if="getWriteAdded(tc) > 0" class="tool-diff tool-diff-added">+{{ getWriteAdded(tc) }}</span>
        <span v-if="getEditAdded(tc) > 0" class="tool-diff tool-diff-added">+{{ getEditAdded(tc) }}</span>
        <span v-if="getEditRemoved(tc) > 0" class="tool-diff tool-diff-removed">-{{ getEditRemoved(tc) }}</span>
        <span v-if="getInlineStatus(tc)" class="tool-status-inline">{{ getInlineStatus(tc) }}</span>
      </div>
      <div v-if="shouldShowOutput(tc)" class="tool-call-output">
        <pre class="tool-output-block">{{ getOutput(tc) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2, X, Check } from 'lucide-vue-next'
import { useI18n } from '@/i18n'

interface ToolCall {
  id: string
  function: {
    name: string
    arguments: string
  }
  status?: 'pending' | 'running' | 'completed' | 'error'
  result?: string
}

defineProps<{
  toolCalls: ToolCall[]
}>()

const { t } = useI18n()

function parseArgs(args: string): Record<string, unknown> {
  if (!args || !args.trim()) return {}
  try {
    return JSON.parse(args)
  } catch {
    return {}
  }
}

function getRawArg(argsText: string, key: string): string {
  const parsed = parseArgs(argsText)
  const parsedValue = parsed[key]
  if (typeof parsedValue === 'string' && parsedValue.trim()) {
    return parsedValue.trim()
  }

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const closedMatch = argsText.match(new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"])*)"`))
  if (closedMatch?.[1]) {
    return decodePartialJson(closedMatch[1]).trim()
  }

  const partialMatch = argsText.match(new RegExp(`"${escapedKey}"\\s*:\\s*"([\\s\\S]*)$`))
  if (partialMatch?.[1]) {
    return decodePartialJson(partialMatch[1].replace(/\\$/, '')).trim()
  }

  return ''
}

function decodePartialJson(value: string): string {
  return value
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
}

function shortenText(text: string, maxLength = 96): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function joinPreviewParts(...parts: Array<string | undefined>): string {
  return shortenText(parts.map((part) => part?.trim() ?? '').filter(Boolean).join(' '))
}

function countLines(value: string): number {
  if (!value) return 0
  return value.split(/\r?\n/).length
}

function getPreview(tc: ToolCall): string {
  const argsText = tc.function.arguments
  const args = parseArgs(argsText)

  switch (tc.function.name) {
    case 'bash': {
      const command = getRawArg(argsText, 'command') || String(args['command'] || '')
      const cwd = getRawArg(argsText, 'workdir') || getRawArg(argsText, 'cwd') || String(args['workdir'] || args['cwd'] || '')
      return joinPreviewParts(command, cwd ? `@ ${cwd}` : '')
    }
    case 'read':
    case 'write':
    case 'edit':
    case 'file_read':
    case 'file_write':
    case 'file_edit':
      return shortenText(
        getRawArg(argsText, 'file_path') ||
        getRawArg(argsText, 'filePath') ||
        getRawArg(argsText, 'path') ||
        String(args['file_path'] || args['filePath'] || args['path'] || '')
      )
    case 'grep':
    case 'glob': {
      const pattern = getRawArg(argsText, 'pattern') || String(args['pattern'] || '')
      const path = getRawArg(argsText, 'path') ||
        getRawArg(argsText, 'basePath') ||
        getRawArg(argsText, 'file_path') ||
        getRawArg(argsText, 'filePath') ||
        String(args['path'] || args['basePath'] || args['file_path'] || args['filePath'] || '')
      return joinPreviewParts(pattern, path ? `@ ${path}` : '')
    }
    case 'ls':
      return shortenText(getRawArg(argsText, 'path') || String(args['path'] || '.'))
    case 'ask':
      return shortenText(getRawArg(argsText, 'question') || getRawArg(argsText, 'header') || String(args['question'] || args['header'] || ''))
    default:
      return shortenText(
        getRawArg(argsText, 'query') ||
        getRawArg(argsText, 'command') ||
        getRawArg(argsText, 'filePath') ||
        getRawArg(argsText, 'path') ||
        getRawArg(argsText, 'pattern') ||
        getRawArg(argsText, 'question') ||
        String(args['query'] || args['command'] || args['filePath'] || args['path'] || args['pattern'] || args['question'] || '')
      )
  }
}

function getEditAdded(tc: ToolCall): number {
  if (tc.function.name !== 'edit' && tc.function.name !== 'file_edit') return 0
  return countLines(
    getRawArg(tc.function.arguments, 'new_string') ||
    getRawArg(tc.function.arguments, 'newString') ||
    getRawArg(tc.function.arguments, 'new_str')
  )
}

function getEditRemoved(tc: ToolCall): number {
  if (tc.function.name !== 'edit' && tc.function.name !== 'file_edit') return 0
  return countLines(
    getRawArg(tc.function.arguments, 'old_string') ||
    getRawArg(tc.function.arguments, 'oldString') ||
    getRawArg(tc.function.arguments, 'old_str')
  )
}

function getWriteAdded(tc: ToolCall): number {
  if (tc.function.name !== 'write' && tc.function.name !== 'file_write') return 0
  return countLines(getRawArg(tc.function.arguments, 'content'))
}

function getInlineStatus(tc: ToolCall): string {
  if (tc.status === 'pending' || tc.status === 'running' || tc.status === 'error') {
    switch (tc.status) {
      case 'pending': return t('chat.toolPending')
      case 'running': return t('chat.toolRunning')
      case 'error': return t('chat.toolError')
      default: return ''
    }
  }
  return ''
}

function getOutput(tc: ToolCall): string {
  if (tc.function.name === 'bash' && tc.result?.trim()) {
    try {
      const parsed = JSON.parse(tc.result) as Record<string, unknown>
      const stdout = typeof parsed.stdout === 'string' ? parsed.stdout.trim() : ''
      const stderr = typeof parsed.stderr === 'string' ? parsed.stderr.trim() : ''
      const cwd = typeof parsed.cwd === 'string' ? parsed.cwd.trim() : ''
      const command = typeof parsed.command === 'string' ? parsed.command.trim() : ''
      const exitCode = typeof parsed.exitCode === 'number' ? String(parsed.exitCode) : ''
      return [
        command ? `command: ${command}` : '',
        cwd ? `cwd: ${cwd}` : '',
        stdout ? `stdout:\n${stdout}` : '',
        stderr ? `stderr:\n${stderr}` : '',
        exitCode ? `exitCode: ${exitCode}` : ''
      ].filter(Boolean).join('\n\n')
    } catch {
      return tc.result.trim()
    }
  }
  return tc.result?.trim() || t('common.noData')
}

function shouldShowOutput(tc: ToolCall): boolean {
  if (!tc.result?.trim()) return false
  if (tc.function.name === 'bash') return true
  if (tc.function.name === 'ask' && tc.status === 'error') return true
  return tc.status === 'error' && tc.function.name !== 'ask'
}
</script>

<style scoped>
.tool-calls-display {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  margin-bottom: 8px;
  width: 100%;
}

.tool-call-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-muted);
  max-width: 100%;
}

.tool-call-item.error {
  color: var(--text-secondary);
}

.tool-call-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.tool-call-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.tool-name {
  font-weight: 500;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.tool-colon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.tool-preview {
  min-width: 0;
  max-width: 100%;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-diff {
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  flex-shrink: 0;
}

.tool-diff-added {
  color: var(--status-success);
}

.tool-diff-removed {
  color: var(--status-error);
}

.tool-status-inline {
  color: var(--text-muted);
  flex-shrink: 0;
}

.tool-call-output {
  width: min(100%, 720px);
  margin-left: 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.tool-output-block {
  margin: 0;
  padding: 10px 12px;
  font-family: var(--font-mono), monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.45;
  max-height: calc(1.45em * 5 + 20px);
  overflow-y: auto;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
