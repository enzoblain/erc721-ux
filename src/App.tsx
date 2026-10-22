import Transactions from './Transactions'
import ConnectedIdentity from './ConnectedIdentity'
import FakeMeebits from './fakeMeebits/FakeMeebits'
import FakeNefturians from './FakeNefturians'
import FakeBayc from './fakeBayc/FakeBayc'
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
  const [path, setPath] = useState(window.location.pathname)
  const blockKey = `${path}:${wallet.address}:${wallet.chainId}:${mode}`
  const [block, setBlock] = useState<{ key: string; number: string | null; error: string }>({ key: '', number: null, error: '' })
  const blockNumber = block.key === blockKey ? block.number : null
  const blockError = block.key === blockKey ? block.error : ''

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

  function navigate(nextPath: string, replace = false) {
    if (window.location.pathname !== nextPath) {
      if (replace) window.history.replaceState(null, '', nextPath)
      else window.history.pushState(null, '', nextPath)
    }
    setPath(nextPath)
  }

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!wallet.address || wallet.chainId === null) return
    const target = wallet.chainId !== SEPOLIA_ID && path !== '/error' ? '/error'
      : wallet.chainId === SEPOLIA_ID && path === '/error' ? '/chain-info' : null
    if (target) {
      window.history.replaceState(null, '', target)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [wallet.address, wallet.chainId, path])

  useEffect(() => {
    const provider = providerRef.current
    if (path !== '/chain-info' || !wallet.address || wallet.chainId !== SEPOLIA_ID || !provider) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function refreshBlock() {
      try {
        const value = await provider!.request({ method: 'eth_blockNumber' })
        if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
          throw new Error('Le wallet a renvoyé un numéro de bloc invalide.')
        }
        if (active) {
          setBlock({ key: blockKey, number: BigInt(value).toString(), error: '' })
        }
      } catch (cause) {
        if (active) setBlock({ key: blockKey, number: null, error: walletError(cause) })
      } finally {
        if (active) timer = setTimeout(() => void refreshBlock(), 12000)
      }
    }
    void refreshBlock()
    return () => { active = false; clearTimeout(timer) }
  }, [path, wallet.address, wallet.chainId, mode, blockKey])

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
      <nav aria-label="Navigation principale">
        <a href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}>Connexion</a>
        {' · '}
        <a href="/chain-info" onClick={(event) => { event.preventDefault(); navigate('/chain-info') }}>Informations réseau</a>
      </nav>
      <p><a href="/fakeBayc" onClick={(event) => { event.preventDefault(); navigate('/fakeBayc') }}>FakeBAYC</a></p>
      <p><a href="/fakeNefturians" onClick={(event) => { event.preventDefault(); navigate('/fakeNefturians') }}>FakeNefturians</a></p>
      <p><a href="/fakeMeebits" onClick={(event) => { event.preventDefault(); navigate('/fakeMeebits') }}>FakeMeebits</a></p>
      <h1>{path === '/fakeMeebits' ? 'FakeMeebits' : path.startsWith('/fakeNefturians') ? 'FakeNefturians' : path.startsWith('/fakeBayc') ? 'FakeBAYC' : path === '/error' ? 'Réseau incorrect' : path === '/chain-info' ? 'Informations réseau' : 'Connecter mon wallet'}</h1>
      {path === '/fakeMeebits' ? <FakeMeebits key={`${wallet.address ?? ''}:${wallet.chainId ?? ''}`} wallet={wallet} getProvider={() => providerRef.current} /> : path.startsWith('/fakeNefturians') ? <FakeNefturians key={`${path}:${wallet.address ?? ''}:${wallet.chainId ?? ''}`} path={path} wallet={wallet} getProvider={() => providerRef.current} navigate={navigate} /> : path.startsWith('/fakeBayc') ? <FakeBayc key={`${path}:${wallet.address ?? ''}:${wallet.chainId ?? ''}`} path={path} wallet={wallet} getProvider={() => providerRef.current} navigate={navigate} /> : path === '/error' ? (
        <section role="alert">
          <h2>Sepolia est nécessaire</h2>
          <p>{wallet.chainId === null ? 'Aucun réseau connecté.' : `Ton wallet utilise le réseau ${wallet.chainId}. Le TD utilise Sepolia (11155111).`}</p>
          <p>Utilise le bouton « Passer sur Sepolia » ci-dessous pour revenir aux informations réseau.</p>
        </section>
      ) : path === '/chain-info' ? (
        <section aria-label="Informations de la chaîne">
          {!wallet.address ? <p>Connecte ton wallet ci-dessous pour afficher les informations réseau.</p> : wallet.chainId === SEPOLIA_ID ? (
            <>
              <dl>
                <dt>chainId</dt><dd>{wallet.chainId}</dd>
                <dt>Dernier bloc</dt><dd aria-live="polite">{blockError ? 'Indisponible' : blockNumber ?? 'Chargement…'}</dd>
                <dt>Adresse connectée</dt><dd className="address"><ConnectedIdentity key={wallet.address} address={wallet.address} /></dd>
              </dl>
              <p>Le numéro de bloc est actualisé toutes les 12 secondes.</p>
              {blockError && <p role="alert" className="error">Lecture du bloc impossible : {blockError}. Nouvelle tentative automatique.</p>}
            </>
          ) : <p role="status">Vérification du réseau…</p>}
        </section>
      ) : <p>Utilise ton wallet navigateur ou scanne le QR code avec ton wallet mobile.</p>}
      {!mode ? (
        <div className="actions">
          <button disabled={busy} onClick={() => void connectBrowser()}>Wallet navigateur</button>
          <button disabled={busy} onClick={() => void connectMobile()}>WalletConnect · QR code</button>
        </div>
      ) : (
        <section aria-label="Wallet connecté">
          <dl>
            <dt>Connexion</dt><dd>{mode === 'browser' ? 'Wallet navigateur' : 'WalletConnect'}</dd>
            <dt>Adresse</dt><dd className="address">{wallet.address ? <ConnectedIdentity key={wallet.address} address={wallet.address} /> : 'Aucun compte accessible : déverrouille ton wallet.'}</dd>
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
      <Transactions />
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
