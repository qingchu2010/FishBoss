import { spawn } from 'node:child_process'

const children = []

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options
  })
  children.push(child)
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown(code)
    }
  })
  return child
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('pnpm', ['dev'])
run('pnpm', ['--dir', 'frontend', 'dev'])
