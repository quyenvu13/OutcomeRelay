import { spawnSync } from 'node:child_process'

const candidates = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []], ['python3', []]]
  : [['python3', []], ['python', []], ['py', ['-3']]]

let selected = null
for (const [command, prefix] of candidates) {
  const probe = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8' })
  const output = `${probe.stdout || ''}${probe.stderr || ''}`
  if (probe.status === 0 && /Python 3\./.test(output)) {
    selected = [command, prefix]
    break
  }
}

if (!selected) {
  console.error('Python 3 was not found. Install Python 3 or enable the Windows py launcher.')
  process.exit(1)
}

const [command, prefix] = selected
const run = spawnSync(
  command,
  [...prefix, '-m', 'unittest', 'discover', '-s', 'tests/contract-direct', '-p', 'test_*.py', '-v'],
  { stdio: 'inherit' },
)

process.exit(run.status ?? 1)
