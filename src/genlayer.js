import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { TransactionStatus } from 'genlayer-js/types'
import {
  CONTRACT_ADDRESS,
  CONTRACT_EXPLORER_URL,
  EXPLORER_BASE,
} from './config.js'
import {
  executionOutcome,
  rollbackReason,
} from './tx-truth.js'

const STUDIONET_CHAIN_ID = 61999
const STUDIONET_CHAIN_HEX = '0xf22f'
const CANONICAL_RPC = 'https://studio.genlayer.com/api'

let readClientPromise

function proxyChain() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:4173'
  const proxy = `${origin}/api/rpc`
  return {
    ...studionet,
    id: STUDIONET_CHAIN_ID,
    rpcUrls: {
      ...studionet.rpcUrls,
      default: { http: [proxy] },
      public: { http: [proxy] },
    },
  }
}

async function getReadClient() {
  if (!readClientPromise) {
    readClientPromise = Promise.resolve(createClient({ chain: proxyChain() }))
  }
  return readClientPromise
}

export async function ensureStudioNet() {
  if (!window.ethereum) throw new Error('MetaMask was not detected in this browser.')

  const current = await window.ethereum.request({ method: 'eth_chainId' })
  if (String(current).toLowerCase() === STUDIONET_CHAIN_HEX) return

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_HEX }],
    })
  } catch (error) {
    if (Number(error?.code) !== 4902) throw error
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: STUDIONET_CHAIN_HEX,
        chainName: 'GenLayer StudioNet',
        nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
        rpcUrls: [CANONICAL_RPC],
        blockExplorerUrls: [EXPLORER_BASE],
      }],
    })
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_HEX }],
    })
  }

  const confirmed = await window.ethereum.request({ method: 'eth_chainId' })
  if (String(confirmed).toLowerCase() !== STUDIONET_CHAIN_HEX) {
    throw new Error('Wallet is not connected to GenLayer StudioNet (61999).')
  }
}

export function shortAddress(value, left = 6, right = 4) {
  if (!value) return '—'
  if (value.length <= left + right + 3) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

export function txExplorerUrl(hash) {
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function contractExplorerUrl() {
  return CONTRACT_EXPLORER_URL
}

export function cleanError(error) {
  const text = String(error?.shortMessage || error?.message || error || 'Unknown error')
  return text
    .replace(/^Error:\s*/i, '')
    .replace(/\n\s*Details:[\s\S]*$/i, '')
    .trim()
}

export async function connectWallet() {
  if (!window.ethereum) throw new Error('MetaMask was not detected in this browser.')
  await ensureStudioNet()
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  const account = accounts?.[0]
  if (!account) throw new Error('No wallet account was returned.')

  const client = createClient({
    chain: proxyChain(),
    account,
    provider: window.ethereum,
  })
  return { account, client }
}

export async function currentWallet() {
  if (!window.ethereum) return null
  const accounts = await window.ethereum.request({ method: 'eth_accounts' })
  return accounts?.[0] || null
}

async function read(functionName, args = []) {
  const client = await getReadClient()
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: 'accepted',
  })
}

export const readConfig = () => read('get_config')
export const readObligation = (obligationId) => read('get_obligation', [Number(obligationId)])
export const readSubstitute = (substituteId) => read('get_substitute', [Number(substituteId)])
export const readAttempt = (obligationId, attemptId) => read('get_attempt', [Number(obligationId), Number(attemptId)])
export const readAttempts = (obligationId, fromId, count) => read('get_attempts', [Number(obligationId), Number(fromId), Number(count)])

export async function submitWrite(client, functionName, args = []) {
  // SDK 1.1.8 skips its chain assertion for Studio chains. Recheck before
  // every write; Snap is not required for eth_sendTransaction.
  await ensureStudioNet()
  return client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: 0n,
  })
}

async function finalizedReceipt(hash) {
  const client = await getReadClient()

  if (typeof client.waitForTransactionReceipt === 'function' && TransactionStatus?.FINALIZED != null) {
    return client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      interval: 5000,
      retries: 240,
      fullTransaction: true,
    })
  }

  if (typeof client.waitForFinalization === 'function') {
    return client.waitForFinalization({ hash })
  }

  throw new Error('This GenLayerJS version does not expose a finalization waiter.')
}

async function getTransaction(hash) {
  const client = await getReadClient()
  if (typeof client.getTransaction !== 'function') return null
  try {
    return await client.getTransaction({ hash })
  } catch {
    return null
  }
}

export async function waitForAuthoritativeExecution(hash, onProgress = () => {}) {
  onProgress({ phase: 'finalizing', message: 'Waiting for consensus finalization…' })
  const receipt = await finalizedReceipt(hash)

  let outcome = executionOutcome(receipt)
  if (outcome.ok !== null) {
    return { receipt, transaction: null, outcome, reason: outcome.ok ? '' : rollbackReason(receipt) }
  }

  onProgress({ phase: 'execution', message: 'Finalized. Checking authoritative leader execution…' })

  const started = Date.now()
  let transaction = null
  while (Date.now() - started < 60_000) {
    transaction = await getTransaction(hash)
    outcome = executionOutcome(receipt, transaction)
    if (outcome.ok !== null) {
      return {
        receipt,
        transaction,
        outcome,
        reason: outcome.ok ? '' : rollbackReason(transaction || receipt),
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

  return {
    receipt,
    transaction,
    outcome: { ok: null, name: 'EXECUTION_RESULT_UNAVAILABLE', evidence: 'NONE' },
    reason: 'Confirmation is delayed. Do not resubmit this transaction until its execution result is known.',
  }
}
