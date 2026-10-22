import { createPublicClient, createWalletClient, custom, http, parseAbi } from 'viem'
import type { Address, EIP1193Provider, Hash } from 'viem'
import { sepolia } from 'viem/chains'
import type { WalletProvider } from '../wallet'

export const BAYC = '0xF865E7DF924c46556d01997B35ed7A3f85069B62' as const
export const NEFTURIANS = '0x9a5E2c5B08cA4031d3F7fA1D7AAb8FFE79a988E2' as const
export const nefturiansAbi = parseAbi([
  'function tokenPrice() view returns (uint256)',
  'function buyAToken() payable',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
])
export const MEEBITS = '0x71A66d19c6ABFc629e0c71D6606105af991713F0' as const
export const CLAIMER = '0x86FB988958dB5A703B3A458284c36976638A67e3' as const
export const claimerAbi = parseAbi([
  'function tokensThatWereClaimed(uint256 tokenId) view returns (bool)',
  'function maxTokenId() view returns (uint256)',
  'function whitelist(address signer) view returns (bool)',
  'function fakeMeebits() view returns (address)',
  'function claimAToken(uint256 tokenId, bytes signature) payable',
])
export const EVALUATOR = '0x2822168E32E642a93DC677384d8f3F13E5b0EfC2' as const
export const baycAbi = parseAbi([
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function tokenCounter() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function claimAToken()',
])
export const evaluatorAbi = parseAbi([
  'function hasSubmitted(address student) view returns (bool)',
  'function exerciseProgression(address student, uint256 exercise) view returns (bool)',
  'function submitExercise()',
  'function ex1_claimedFakeBAYC()',
  'function ex2_boughtFakeNefturians()',
  'function ex3_claimedFakeMeebits()',
])
export const client = createPublicClient({
  chain: sepolia,
  transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL?.trim() || 'https://ethereum-sepolia-rpc.publicnode.com', { timeout: 15000 }),
})

export async function sendAction(
  provider: WalletProvider, account: Address,
  action: 'claimMeebit' | 'ex3_claimedFakeMeebits' | 'claimAToken' | 'buyAToken' | 'submitExercise' | 'ex1_claimedFakeBAYC' | 'ex2_boughtFakeNefturians',
  onHash: (hash: Hash) => void,
  claim?: { tokenId: bigint; signature: `0x${string}` },
) {
  const [chainId, accounts] = await Promise.all([
    provider.request({ method: 'eth_chainId' }), provider.request({ method: 'eth_accounts' }),
  ])
  if (Number(chainId) !== sepolia.id) throw new Error('Passe sur Sepolia avant de continuer.')
  if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== account.toLowerCase()) {
    throw new Error('Le compte du wallet a changé. Relance la demande avec le compte actif.')
  }
  const wallet = createWalletClient({ chain: sepolia, transport: custom(provider as EIP1193Provider) })
  let hash: Hash
  if (action === 'claimMeebit') {
    if (!claim) throw new Error('Sélectionne un NFT et sa signature.')
    const claimed = await client.readContract({ address: CLAIMER, abi: claimerAbi, functionName: 'tokensThatWereClaimed', args: [claim.tokenId] })
    if (claimed) throw new Error('Ce NFT vient d’être réclamé. Actualise la liste et choisis-en un autre.')
    const { request } = await client.simulateContract({ address: CLAIMER, abi: claimerAbi, functionName: 'claimAToken', args: [claim.tokenId, claim.signature], account, value: 0n })
    hash = await wallet.writeContract(request)
  } else if (action === 'buyAToken') {
    const value = await client.readContract({ address: NEFTURIANS, abi: nefturiansAbi, functionName: 'tokenPrice' })
    const { request } = await client.simulateContract({ address: NEFTURIANS, abi: nefturiansAbi, functionName: action, account, value })
    hash = await wallet.writeContract(request)
  } else if (action === 'claimAToken') {
    const { request } = await client.simulateContract({ address: BAYC, abi: baycAbi, functionName: action, account })
    hash = await wallet.writeContract(request)
  } else {
    const { request } = await client.simulateContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: action, account })
    hash = await wallet.writeContract(request)
  }
  onHash(hash)
  const receipt = await client.waitForTransactionReceipt({
    hash,
    onReplaced: ({ transaction }) => onHash(transaction.hash),
  })
  if (receipt.status !== 'success') throw new Error('La transaction a échoué sur la chaîne.')
  return receipt
}
