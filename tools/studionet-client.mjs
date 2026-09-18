import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'

export const RPC = 'https://studio.genlayer.com/api'

const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const response = await realFetch(input, {
    ...init,
    headers: {
      ...init.headers,
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 SubstituteDuty/1.1',
      origin: 'https://studio.genlayer.com',
      referer: 'https://studio.genlayer.com/',
    },
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}: ${body.slice(0, 500)}`)
  return new Response(body, { status: response.status, headers: response.headers })
}

export const chain = {
  ...studionet,
  id: 61999,
  rpcUrls: {
    ...studionet.rpcUrls,
    default: { http: [RPC] },
    public: { http: [RPC] },
  },
}

export const client = createClient({ chain })

export function requiredAddress(name) {
  const value = process.env[name]
  if (!/^0x[0-9a-fA-F]{40}$/.test(value || '')) {
    throw new Error(`Set ${name} to a valid 0x address.`)
  }
  return value
}

export function printable(value) {
  return JSON.stringify(value, (_, item) => (
    typeof item === 'bigint' ? item.toString() : item
  ), 2)
}
