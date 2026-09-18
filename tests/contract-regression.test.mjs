import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(root, 'contract', 'OutcomeRelay.py'), 'utf8')
const vectors = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'blind-vectors.json'), 'utf8'))

function gate(candidate) {
  const failures = []
  const requireText = (needle, label) => {
    if (!candidate.includes(needle)) failures.push(label)
  }

  requireText('PROMPT_VERSION = "substitute-duty-v1.1-prompt-1"', 'prompt version')
  requireText('def acknowledge_outcome(self, obligation_id: int)', 'obligee acknowledgement')
  requireText('if not obligation.outcome_acknowledged:', 'pre-ack block')
  requireText('MAX_MODEL_CALLS_PER_OBLIGATION = 8', 'fresh model-call cap')
  requireText('obligation.model_calls = u256(int(obligation.model_calls) + 1)', 'fresh-call accounting')
  requireText('VERDICT_SOURCE_CACHE if used_cache else VERDICT_SOURCE_MODEL', 'verdict provenance')
  requireText('for _ in range(8):', 'fixed-point sanitizer')
  requireText('cleaned = cleaned.replace("<", " ").replace(">", " ")', 'fence fallback')
  requireText('self._safe_prompt_text(protected_outcome)', 'sanitized cache outcome')
  requireText('self._safe_prompt_text(substitute_text)', 'sanitized cache candidate')
  requireText('raise gl.vm.UserError("Invalid semantic output")', 'malformed output reverts')

  if (/except Exception:\s*\n\s*return \{"verdict": SUBSTITUTE_INADEQUATE\}/.test(candidate)) {
    failures.push('model failure must not become verdict')
  }
  if (/def _classify_substitute\([^)]*original_duty/s.test(candidate)) {
    failures.push('semantic anchor accepts original duty')
  }
  if (/def _classify_substitute\([^)]*active_substitute/s.test(candidate)) {
    failures.push('semantic anchor accepts active substitute')
  }
  for (const forbidden of ['def cancel_', 'def withdraw_', 'def reset_', 'def revoke_']) {
    if (candidate.includes(forbidden)) failures.push(`escape path: ${forbidden}`)
  }
  for (const forbidden of ['emit_transfer', 'time.time(', 'datetime.now(']) {
    if (candidate.includes(forbidden)) failures.push(`forbidden runtime primitive: ${forbidden}`)
  }
  return { ok: failures.length === 0, failures }
}

test('frozen candidate satisfies every static invariant', () => {
  assert.deepEqual(gate(source), { ok: true, failures: [] })
})

const mutations = [
  ['remove acknowledge write', 'def acknowledge_outcome(self, obligation_id: int)', 'def acknowledge_removed(self, obligation_id: int)'],
  ['remove pre-ack guard', 'if not obligation.outcome_acknowledged:', 'if False:'],
  ['remove model-call cap', 'MAX_MODEL_CALLS_PER_OBLIGATION = 8', 'MAX_MODEL_CALLS_REMOVED = 8'],
  ['remove prompt version', 'PROMPT_VERSION = "substitute-duty-v1.1-prompt-1"', 'PROMPT_VERSION_REMOVED = "x"'],
  ['remove fixed-point sanitizer', 'for _ in range(8):', 'for _ in range(0):'],
  ['remove fence fallback', 'cleaned = cleaned.replace("<", " ").replace(">", " ")', 'cleaned = cleaned'],
  ['remove cache-source provenance', 'VERDICT_SOURCE_CACHE if used_cache else VERDICT_SOURCE_MODEL', 'VERDICT_SOURCE_MODEL'],
]

for (const [name, from, to] of mutations) {
  test(`mutation is killed: ${name}`, () => {
    assert.ok(source.includes(from), `mutation target missing: ${from}`)
    const result = gate(source.replace(from, to))
    assert.equal(result.ok, false)
    assert.ok(result.failures.length > 0)
  })
}

test('blind runtime vectors are absent from contract source', () => {
  for (const [name, value] of Object.entries(vectors)) {
    if (name === 'domain') continue
    const distinctive = value.toLowerCase().replace(/\s+/g, ' ').trim()
    const normalizedSource = source.toLowerCase().replace(/\s+/g, ' ')
    assert.equal(normalizedSource.includes(distinctive), false, `${name} leaked into source`)
  }
})

test('old leaked runtime vectors are removed', () => {
  for (const leaked of [
    'Critical customer incidents must receive immediate human escalation',
    'Provide human email support during normal business hours',
    'Provide a 24/7 emergency callback service',
    'Provide a 24/7 automated chatbot',
  ]) {
    assert.equal(source.includes(leaked), false, leaked)
  }
})
