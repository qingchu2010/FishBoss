const UTF8_REPLACEMENT = '\uFFFD'

export function decodeTextBuffer(buffer: Buffer): string {
  const utf8Text = buffer.toString('utf8')
  const utf8ReplacementCount = countReplacementCharacters(utf8Text)
  if (utf8ReplacementCount === 0) {
    return utf8Text
  }

  const gb18030Text = new TextDecoder('gb18030').decode(buffer)
  const gb18030ReplacementCount = countReplacementCharacters(gb18030Text)
  if (gb18030ReplacementCount < utf8ReplacementCount) {
    return gb18030Text
  }

  return utf8Text
}

export function splitLines(value: string): string[] {
  if (value.length === 0) {
    return []
  }
  const lines = value.split(/\r?\n/)
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

function countReplacementCharacters(value: string): number {
  return value.split(UTF8_REPLACEMENT).length - 1
}
