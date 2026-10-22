import { useEffect, useRef, useState } from 'react'
import type WalletConnectProvider from '@walletconnect/ethereum-provider'
import {
  connectBrowserWallet, firstAccount, parseChainId, SEPOLIA_ID,
  subscribeWallet, switchToSepolia, walletError,
} from './wallet'
import type { WalletProvider, WalletState } from './wallet'

const RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL?.trim() || 'https://ethereum-sepolia-rpc.publicnode.com'
const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()
const emptyWallet: WalletState = { address: null, chainId: null }

export default function App() {
  const [wallet, setWallet] = useState<WalletState>(emptyWallet)
  const [mode, setMode] = useState<'browser' | 'mobile' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [qrCode, setQrCode] = useState('')
  const providerRef = useRef<WalletProvider | null>(null)
  const mobileRef = useRef<WalletConnectProvider | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      unsubscribeRef.current?.()
    }
  }, [])

  function attach(provider: WalletProvider, kind: 'browser' | 'mobile') {
    unsubscribeRef.current?.()
    providerRef.current = provider
    setMode(kind)
    unsubscribeRef.current = subscribeWallet(
      provider,
      (address) => setWallet((current) => ({ ...current, address })),
      (chainId) => setWallet((current) => ({ ...current, chainId })),
      () => {
        setWallet(emptyWallet)
        setMode(null)
        providerRef.current = null
        unsubscribeRef.current?.()
      },
    )
  }

  async function connectBrowser() {
    setBusy(true)
    setError('')
    try {
      const provider = (window as Window & { ethereum?: WalletProvider }).ethereum
      if (!provider) throw new Error('Aucun wallet navigateur détecté. Installe MetaMask ou utilise WalletConnect.')
      const state = await connectBrowserWallet(provider)
      if (!state.address) throw new Error('Aucun compte autorisé par le wallet.')
      if (!mountedRef.current) return
      attach(provider, 'browser')
      setWallet(state)
    } catch (cause) {
      if (mountedRef.current) setError(walletError(cause))
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  async function connectMobile() {
    setBusy(true)
    setError('')
    try {
      if (!PROJECT_ID) throw new Error('Renseigne VITE_WALLETCONNECT_PROJECT_ID dans .env.local puis relance le serveur.')
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
      const { default: QRCode } = await import('qrcode')
      const provider = mobileRef.current ?? await EthereumProvider.init({
        projectId: PROJECT_ID,
        chains: [SEPOLIA_ID],
        optionalMethods: ['wallet_switchEthereumChain', 'wallet_addEthereumChain'],
        rpcMap: { [SEPOLIA_ID]: RPC_URL },
        showQrModal: false,
        metadata: {
          name: 'TD7 — ERC721 UX 101',
          description: 'Connexion wallet pour le TD7',
          url: window.location.origin,
          icons: [],
        },
      })
      mobileRef.current = provider
      const showQr = (uri: string) => {
        void QRCode.toDataURL(uri, { width: 300, margin: 2 }).then((image) => {
          if (mountedRef.current && provider.connecting) setQrCode(image)
        }).catch((cause: unknown) => {
          if (mountedRef.current) setError(walletError(cause))
        })
      }
      provider.on('display_uri', showQr)
      try {
        if (!provider.session) await provider.connect()
        if (!mountedRef.current) return
        // The SDK uses the same EIP-1193 provider API as browser wallets.
        const active = provider as unknown as WalletProvider
        attach(active, 'mobile')
        setWallet({
          address: firstAccount(await active.request({ method: 'eth_accounts' })),
          chainId: parseChainId(await active.request({ method: 'eth_chainId' })),
        })
      } finally {
        provider.removeListener('display_uri', showQr)
        if (mountedRef.current) setQrCode('')
      }
    } catch (cause) {
      if (mountedRef.current) setError(walletError(cause))
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  async function switchChain() {
    if (!providerRef.current) return
    setBusy(true)
    setError('')
    try {
      const chainId = await switchToSepolia(providerRef.current, RPC_URL)
      if (mountedRef.current) setWallet((current) => ({ ...current, chainId }))
    } catch (cause) {
      if (mountedRef.current) setError(walletError(cause))
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError('')
    try {
      if (mode === 'mobile') await mobileRef.current?.disconnect()
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      providerRef.current = null
      setWallet(emptyWallet)
      setMode(null)
    } catch (cause) {
      setError(walletError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <p className="eyebrow">TD7 · ERC721 UX 101</p>
      <h1>Connecter mon wallet</h1>
      <p>Utilise ton wallet navigateur ou scanne le QR code avec ton wallet mobile.</p>
      {!mode ? (
        <div className="actions">
          <button disabled={busy} onClick={() => void connectBrowser()}>Wallet navigateur</button>
          <button disabled={busy} onClick={() => void connectMobile()}>WalletConnect · QR code</button>
        </div>
      ) : (
        <section aria-label="Wallet connecté">
          <dl>
            <dt>Connexion</dt><dd>{mode === 'browser' ? 'Wallet navigateur' : 'WalletConnect'}</dd>
            <dt>Adresse</dt><dd className="address">{wallet.address ?? 'Aucun compte accessible : déverrouille ton wallet.'}</dd>
            <dt>Réseau</dt><dd>{wallet.chainId === SEPOLIA_ID ? 'Sepolia' : wallet.chainId === null ? 'Inconnu' : `Autre réseau (${wallet.chainId})`}</dd>
          </dl>
          {wallet.chainId !== SEPOLIA_ID && <p className="notice">Sélectionne Sepolia pour continuer le TD.</p>}
          <div className="actions">
            <button disabled={busy || wallet.chainId === SEPOLIA_ID} onClick={() => void switchChain()}>
              {wallet.chainId === SEPOLIA_ID ? 'Sepolia sélectionné' : 'Passer sur Sepolia'}
            </button>
            <button className="secondary" disabled={busy} onClick={() => void disconnect()}>Déconnecter</button>
          </div>
        </section>
      )}
      {busy && <p role="status">En attente du wallet…</p>}
      {qrCode && <section className="qr" aria-label="Connexion mobile">
        <h2>Scanner avec ton wallet</h2>
        <img src={qrCode} width="300" height="300" alt="QR code de connexion WalletConnect" />
        <p>Ouvre WalletConnect dans ton wallet mobile, scanne puis approuve la connexion.</p>
      </section>}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  )
}
