import test from 'node:test'
import assert from 'node:assert/strict'
import {
  executionOutcome,
  rawLeaderExecution,
  verifyAcknowledgePostcondition,
  verifyCreatePostcondition,
  verifyProposalPostcondition,
  verifyRollbackPostcondition,
} from '../src/tx-truth.js'

test('finalized without execution evidence is never called success', () => {
  assert.equal(executionOutcome({ statusName: 'FINALIZED' }).ok, null)
})

test('explicit SDK and leader execution evidence are recognized', () => {
  assert.equal(executionOutcome({ txExecutionResultName: 'FINISHED_WITH_RETURN' }).ok, true)
  const leader = { consensus_data: { leader_receipt: { mode: 'leader', execution_result: 'SUCCESS' } } }
  assert.equal(rawLeaderExecution(leader), 'SUCCESS')
  assert.equal(executionOutcome(leader).evidence, 'LEADER_RECEIPT')
})

test('leader execution error stays an error', () => {
  const failed = { consensus_data: { leader_receipt: [{ mode: 'leader', execution_result: 'ERROR' }] } }
  assert.equal(executionOutcome(failed).ok, false)
})

test('create proof checks roles, text, counters and pending status', () => {
  const input = { originalDuty: 'Duty', protectedOutcome: 'Outcome', obligee: '0x' + '2'.repeat(40) }
  const record = { obligation_id: 4, obligor: '0x' + '1'.repeat(40), obligee: input.obligee, original_duty: 'Duty', protected_outcome: 'Outcome', outcome_status: 'OUTCOME_PENDING', attempt_count: 0, active_substitute_id: 0 }
  assert.equal(verifyCreatePostcondition({ obligation_count: 3 }, { obligation_count: 4 }, record, input, record.obligor).ok, true)
  assert.equal(verifyCreatePostcondition({ obligation_count: 3 }, { obligation_count: 5 }, record, input, record.obligor).ok, false)
})

test('acknowledgement arms once without changing duty counters', () => {
  const before = { outcome_status: 'OUTCOME_PENDING', attempt_count: 0, model_calls: 0, accepted_substitutions: 0, rejected_substitutions: 0, active_substitute_id: 0, active_text: 'Duty' }
  assert.equal(verifyAcknowledgePostcondition(before, { ...before, outcome_status: 'OUTCOME_ARMED' }).ok, true)
  assert.equal(verifyAcknowledgePostcondition(before, { ...before, outcome_status: 'OUTCOME_ARMED', attempt_count: 1 }).ok, false)
})

test('preserving substitute advances accepted state and model accounting', () => {
  const before = { attempt_count: 1, model_calls: 1, accepted_substitutions: 0, rejected_substitutions: 1, active_substitute_id: 0 }
  const after = { attempt_count: 2, model_calls: 2, accepted_substitutions: 1, rejected_substitutions: 1, active_substitute_id: 8 }
  const attempt = { verdict: 'SUBSTITUTE_PRESERVES_OUTCOME', verdict_source: 'MODEL', accepted: true, resulting_substitute_id: 8 }
  assert.equal(verifyProposalPostcondition(before, after, attempt).ok, true)
})

test('inadequate cached substitute only advances rejection and attempt', () => {
  const before = { attempt_count: 2, model_calls: 2, accepted_substitutions: 1, rejected_substitutions: 1, active_substitute_id: 8 }
  const after = { attempt_count: 3, model_calls: 2, accepted_substitutions: 1, rejected_substitutions: 2, active_substitute_id: 8 }
  const attempt = { verdict: 'SUBSTITUTE_INADEQUATE', verdict_source: 'CACHE', accepted: false, resulting_substitute_id: 0 }
  assert.equal(verifyProposalPostcondition(before, after, attempt).ok, true)
})

test('rollback proof compares every protected obligation field', () => {
  const before = { obligor: 'a', obligee: 'b', original_duty: 'd', protected_outcome: 'o', outcome_status: 'OUTCOME_ARMED', original_status: 'ACTIVE', active_substitute_id: 0, active_text: 'd', accepted_substitutions: 0, attempt_count: 0, model_calls: 0, rejected_substitutions: 0 }
  assert.equal(verifyRollbackPostcondition(before, { ...before }).ok, true)
  assert.equal(verifyRollbackPostcondition(before, { ...before, attempt_count: 1 }).ok, false)
})
