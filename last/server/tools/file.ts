import fs from 'fs'

const RETRYABLE_WRITE_CODES = new Set(['EBUSY', 'EPERM'])

export async function writeTextFileWithRetry(filePath: string, content: string, signal?: AbortSignal): Promise<void> {
  let lastError: unknown

  for (let attempt = 0; attempt < 5; attempt++) {
    ensureNotAborted(signal)

    try {
      await fs.promises.writeFile(filePath, content, 'utf-8')
      return
    } catch (error) {
      lastError = error
      const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code || '') : ''
      if (!RETRYABLE_WRITE_CODES.has(code) || attempt === 4) {
        break
      }
      await delay(120 * (attempt + 1), signal)
    }
  }

  const code = lastError instanceof Error && 'code' in lastError
    ? String((lastError as NodeJS.ErrnoException).code || '')
    : ''

  if (RETRYABLE_WRITE_CODES.has(code)) {
    throw new Error(`File is locked by another process: ${filePath}`)
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error(`Failed to write file: ${filePath}`)
}

export function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Tool execution aborted by user')
  }
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  ensureNotAborted(signal)

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new Error('Tool execution aborted by user'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
