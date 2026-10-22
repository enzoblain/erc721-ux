import { useState } from 'react'
import { createPublicClient, http, isAddress } from 'viem'
import type { Address } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'
import { verifiedEnsName } from './ens'
import { useLoad } from './useLoad'

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(import.meta.env.VITE_MAINNET_RPC_URL?.trim() || 'https://ethereum-rpc.publicnode.com', { timeout: 8000, retryCount: 0 }),
})
export default function ConnectedIdentity({ address }: { address: string }) {
  const [loader] = useState(() => async () => {
    if (!isAddress(address, { strict: false })) return null
    return verifiedEnsName(address, {
      reverse: (value) => ensClient.getEnsName({ address: value as Address }),
      forward: (name) => ensClient.getEnsAddress({ name: normalize(name) }),
    })
  })
  const result = useLoad(loader)
  return <span title={address}>{result.value || address}</span>
}
