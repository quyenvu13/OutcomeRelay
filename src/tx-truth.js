export function upper(value) {
  return String(value ?? '').toUpperCase()
}

export function rawLeaderExecution(value) {
  const consensus = value?.consensus_data || value?.consensusData || value?.transaction?.consensus_data || value?.transaction?.consensusData
  let leader = consensus?.leader_receipt || consensus?.leaderReceipt
  if (Array.isArray(leader)) leader = leader.find((item) => upper(item?.mode) === 'LEADER') || leader[0]
  return upper(leader?.execution_result || leader?.executionResult)
}

export function executionName(value) {
  return upper(value?.txExecutionResultName || value?.executionResultName || value?.transaction?.txExecutionResultName || value?.transaction?.executionResultName)
}

export function executionOutcome(...sources) {
  for (const source of sources.filter(Boolean)) {
    const normalized = executionName(source)
    if (normalized === 'FINISHED_WITH_RETURN' || normalized === 'SUCCESS') return { ok: true, name: 'FINISHED_WITH_RETURN', evidence: 'SDK' }
    if (normalized === 'FINISHED_WITH_ERROR' || normalized === 'ERROR') return { ok: false, name: 'FINISHED_WITH_ERROR', evidence: 'SDK' }
    const raw = rawLeaderExecution(source)
    if (raw === 'SUCCESS' || raw === 'FINISHED_WITH_RETURN') return { ok: true, name: 'FINISHED_WITH_RETURN', evidence: 'LEADER_RECEIPT' }
    if (raw === 'ERROR' || raw === 'FINISHED_WITH_ERROR') return { ok: false, name: 'FINISHED_WITH_ERROR', evidence: 'LEADER_RECEIPT' }
  }
  return { ok: null, name: 'EXECUTION_RESULT_UNAVAILABLE', evidence: 'NONE' }
}

export function rollbackReason(value) {
  const consensus = value?.consensus_data || value?.consensusData || value?.transaction?.consensus_data || value?.transaction?.consensusData
  let leader = consensus?.leader_receipt || consensus?.leaderReceipt
  if (Array.isArray(leader)) leader = leader.find((item) => upper(item?.mode) === 'LEADER') || leader[0]
  const candidates = [value?.error, value?.message, value?.returnData, value?.return_data, value?.transaction?.error, value?.transaction?.message, leader?.error, leader?.message, leader?.return_data, leader?.returnData]
  return candidates.find((item) => typeof item === 'string' && item.trim())?.trim() || 'Contract execution rolled back.'
}

const same = (a, b, keys) => keys.every((key) => String(a?.[key]) === String(b?.[key]))
const obligationKeys = ['obligor', 'obligee', 'original_duty', 'protected_outcome', 'outcome_status', 'original_status', 'active_substitute_id', 'active_text', 'accepted_substitutions', 'attempt_count', 'model_calls', 'rejected_substitutions']

export function verifyCreatePostcondition(beforeConfig, afterConfig, record, input, obligor) {
  const ok = Number(afterConfig?.obligation_count) === Number(beforeConfig?.obligation_count) + 1
    && Number(record?.obligation_id) === Number(afterConfig?.obligation_count)
    && String(record?.obligor).toLowerCase() === String(obligor).toLowerCase()
    && String(record?.obligee).toLowerCase() === String(input.obligee).toLowerCase()
    && String(record?.original_duty) === String(input.originalDuty).trim()
    && String(record?.protected_outcome) === String(input.protectedOutcome).trim()
    && String(record?.outcome_status) === 'OUTCOME_PENDING'
    && Number(record?.attempt_count) === 0
    && Number(record?.active_substitute_id) === 0
  return { ok, message: ok ? `Obligation #${record.obligation_id} created and verified on-chain.` : 'Created state did not match every required invariant.' }
}

export function verifyAcknowledgePostcondition(before, after) {
  const stable = ['attempt_count', 'model_calls', 'accepted_substitutions', 'rejected_substitutions', 'active_substitute_id', 'active_text']
  const ok = String(before?.outcome_status) === 'OUTCOME_PENDING' && String(after?.outcome_status) === 'OUTCOME_ARMED' && same(before, after, stable)
  return { ok, message: ok ? 'Protected outcome armed; duty and counters are unchanged.' : 'Acknowledgement postcondition mismatch.' }
}

export function verifyProposalPostcondition(before, after, attempt) {
  if (!before || !after || !attempt) return { ok: false, message: 'Proposal postcondition data is incomplete.' }
  if (Number(after.attempt_count) !== Number(before.attempt_count) + 1) return { ok: false, message: 'Attempt counter did not advance exactly once.' }
  const modelDelta = String(attempt.verdict_source) === 'MODEL' ? 1 : 0
  if (Number(after.model_calls) !== Number(before.model_calls) + modelDelta) return { ok: false, message: 'Model-call accounting is inconsistent with the verdict source.' }
  if (String(attempt.verdict) === 'SUBSTITUTE_PRESERVES_OUTCOME') {
    const ok = attempt.accepted === true && Number(attempt.resulting_substitute_id) > 0 && Number(after.active_substitute_id) === Number(attempt.resulting_substitute_id) && Number(after.accepted_substitutions) === Number(before.accepted_substitutions) + 1 && Number(after.rejected_substitutions) === Number(before.rejected_substitutions)
    return { ok, message: ok ? 'Substitute accepted: protected outcome preserved.' : 'Accepted-substitute postcondition mismatch.' }
  }
  if (String(attempt.verdict) === 'SUBSTITUTE_INADEQUATE') {
    const ok = attempt.accepted === false && Number(attempt.resulting_substitute_id) === 0 && Number(after.active_substitute_id) === Number(before.active_substitute_id) && Number(after.accepted_substitutions) === Number(before.accepted_substitutions) && Number(after.rejected_substitutions) === Number(before.rejected_substitutions) + 1
    return { ok, message: ok ? 'Inadequate substitute rejected; active duty is unchanged.' : 'Rejected-substitute postcondition mismatch.' }
  }
  return { ok: false, message: `Unexpected semantic verdict: ${attempt.verdict || 'missing'}.` }
}

export function verifyRollbackPostcondition(before, after) {
  const ok = same(before, after, obligationKeys)
  return { ok, message: ok ? 'Rollback verified: obligation state is unchanged.' : 'Rollback failed: protected state changed unexpectedly.' }
}
