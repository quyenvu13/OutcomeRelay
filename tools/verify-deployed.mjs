import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { client, requiredAddress } from './studionet-client.mjs'

const address = requiredAddress('CONTRACT_ADDRESS')
const local = await readFile(new URL('../contract/OutcomeRelay.py', import.meta.url), 'utf8')

function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function variants(text) {
  const normalized = normalize(text)
  return [
    normalized,
    normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized,
    `${normalized.replace(/\n$/, '')}\n`,
  ]
}

function hash(text) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')
}

const localHashes = new Set(variants(local).map(hash))
const deployed = await client.getContractCode(address)
const deployedRows = variants(deployed).map((text, index) => ({ variant: index, sha256: hash(text) }))
const match = deployedRows.find((row) => localHashes.has(row.sha256))

console.log('CONTRACT_ADDRESS', address)
console.table(deployedRows)
if (!match) {
  console.error('DEPLOYED_PARITY_FAIL: source differs after allowed newline normalization.')
  process.exitCode = 1
} else {
  console.log(`DEPLOYED_PARITY_PASS ${match.sha256}`)
}
