export const SEPOLIA_ID = 11155111
export const SEPOLIA_HEX = '0xaa36a7'

export interface WalletProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown
}

export interface WalletState {
  address: string | null
  chainId: number | null
}

export function parseChainId(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function firstAccount(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null
}

export async function connectBrowserWallet(provider: WalletProvider): Promise<WalletState> {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  const chain = await provider.request({ method: 'eth_chainId' })
  return { address: firstAccount(accounts), chainId: parseChainId(chain) }
}

export function subscribeWallet(
  provider: WalletProvider,
  onAccounts: (address: string | null) => void,
  onChain: (chainId: number | null) => void,
  onDisconnect: () => void,
) {
  const accounts = (value: unknown) => onAccounts(firstAccount(value))
  const chain = (value: unknown) => onChain(parseChainId(value))
  provider.on('accountsChanged', accounts)
  provider.on('chainChanged', chain)
  provider.on('disconnect', onDisconnect)
  return () => {
    provider.removeListener('accountsChanged', accounts)
    provider.removeListener('chainChanged', chain)
    provider.removeListener('disconnect', onDisconnect)
  }
}

function errorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = error as { code?: number; data?: { originalError?: { code?: number } } }
  return value.code === 4902 ? 4902 : value.data?.originalError?.code ?? value.code
}

export async function switchToSepolia(provider: WalletProvider, rpcUrl: string) {
  const requestSwitch = () => provider.request({
    method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_HEX }],
  })
  try {
    await requestSwitch()
  } catch (error) {
    if (errorCode(error) !== 4902) throw error
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: SEPOLIA_HEX,
        chainName: 'Sepolia',
        nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: [rpcUrl],
        blockExplorerUrls: ['https://sepolia.etherscan.io'],
      }],
    })
    await requestSwitch()
  }
  const chainId = parseChainId(await provider.request({ method: 'eth_chainId' }))
  if (chainId !== SEPOLIA_ID) throw new Error('Le wallet n’a pas basculé sur Sepolia.')
  return chainId
}

export function walletError(error: unknown): string {
  if (errorCode(error) === 4001) return 'Demande refusée dans le wallet. Tu peux réessayer.'
  if (errorCode(error) === -32002) return 'Une demande est déjà ouverte. Consulte ton wallet.'
  return error instanceof Error ? error.message : 'Impossible de communiquer avec le wallet.'
}
