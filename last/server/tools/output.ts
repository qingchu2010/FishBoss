import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getConfigDir } from '../storage/index.js'
import { getPermissionConfig } from './permission.js'

interface ToolResult {
  title: string
  output: string
  metadata?: Record<string, unknown>
}

const MAX_INLINE_OUTPUT_LENGTH = 60000
const MAX_INLINE_OUTPUT_LINES = 1200
const PREVIEW_HEAD_LENGTH = 18000
const PREVIEW_TAIL_LENGTH = 6000

export function finalizeToolResult(toolId: string, result: ToolResult): ToolResult {
  if (!result.output) {
    return result
  }

  const inlineLengthLimit = Math.min(getPermissionConfig().maxOutputLength, MAX_INLINE_OUTPUT_LENGTH)
  const lineCount = countLines(result.output)

  if (result.output.length <= inlineLengthLimit && lineCount <= MAX_INLINE_OUTPUT_LINES) {
    return result
  }

  const savedPath = persistToolOutput(toolId, result.output)
  const preview = buildOutputPreview(result.output, inlineLengthLimit)
  const output = [
    `Output too large to inline (${result.output.length} chars, ${lineCount} lines).`,
    `Full output saved to: ${savedPath}`,
    'Use read or grep on the saved file if you need the exact full result.',
    '',
    preview
  ].join('\n')

  return {
    ...result,
    output,
    metadata: {
      ...result.metadata,
      savedOutputPath: savedPath,
      fullOutputLength: result.output.length,
      fullOutputLines: lineCount,
      truncatedForInline: true
    }
  }
}

function persistToolOutput(toolId: string, output: string): string {
  const outputDir = path.join(getConfigDir(), 'tool-results')
  fs.mkdirSync(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const hash = crypto.createHash('sha1').update(output).digest('hex').slice(0, 10)
  const safeToolId = toolId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'tool'
  const filename = `${timestamp}-${safeToolId}-${hash}.txt`
  const filePath = path.join(outputDir, filename)

  fs.writeFileSync(filePath, output, 'utf-8')
  return filePath
}

function buildOutputPreview(output: string, inlineLengthLimit: number): string {
  const headLength = Math.min(PREVIEW_HEAD_LENGTH, Math.max(Math.floor(inlineLengthLimit * 0.65), 1))
  const tailLength = Math.min(PREVIEW_TAIL_LENGTH, Math.max(inlineLengthLimit - headLength, 1))
  const head = output.slice(0, headLength).trimEnd()
  const tail = output.slice(-tailLength).trimStart()

  if (output.length <= headLength + tailLength + 64) {
    return output
  }

  return [
    '[preview:start]',
    head,
    '',
    `... (${output.length - headLength - tailLength} chars omitted) ...`,
    '',
    '[preview:end]',
    tail
  ].join('\n')
}

function countLines(value: string): number {
  if (!value) {
    return 0
  }

  return value.split(/\r?\n/).length
}
