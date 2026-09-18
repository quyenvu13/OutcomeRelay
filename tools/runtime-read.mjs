import { client, printable, requiredAddress } from './studionet-client.mjs'

const address = requiredAddress('CONTRACT_ADDRESS')
const obligationId = Number(process.env.OBLIGATION_ID || 0)

const config = await client.readContract({
  address,
  functionName: 'get_config',
  args: [],
  stateStatus: 'accepted',
})
console.log('GET_CONFIG')
console.log(printable(config))

if (obligationId > 0) {
  const obligation = await client.readContract({
    address,
    functionName: 'get_obligation',
    args: [obligationId],
    stateStatus: 'accepted',
  })
  console.log(`GET_OBLIGATION_${obligationId}`)
  console.log(printable(obligation))
}
