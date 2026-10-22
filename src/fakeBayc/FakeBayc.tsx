import { transact as runTransaction } from '../transactionStore'
import { transactionError } from '../transactionState'
import { useLoad } from '../useLoad'
import { useState } from 'react'
import { BaseError, ContractFunctionRevertedError, isAddress } from 'viem'
import type { Address } from 'viem'
import type { WalletProvider, WalletState } from '../wallet'
import { SEPOLIA_ID, walletError } from '../wallet'
import { BAYC, EVALUATOR, baycAbi, client, evaluatorAbi, sendAction } from './client'
import { loadMetadata, parseTokenId } from './metadata'
import type { Metadata } from './metadata'

type Props = { path: string; wallet: WalletState; getProvider: () => WalletProvider | null; navigate: (path: string) => void }

function message(cause: unknown) {
  if (cause instanceof BaseError) return cause.shortMessage
  return walletError(cause)
}


function Link({ to, navigate, children }: { to: string; navigate: Props['navigate']; children: React.ReactNode }) {
  return <a href={to} onClick={(event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault(); navigate(to)
  }}>{children}</a>
}

function NftImage({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return src && !failed
    ? <img className="nft-image" src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <p className="image-placeholder">Image indisponible</p>
}

const readCollection = async () => {
  const [name, count] = await Promise.all([
    client.readContract({ address: BAYC, abi: baycAbi, functionName: 'name' }),
    client.readContract({ address: BAYC, abi: baycAbi, functionName: 'tokenCounter' }),
  ])
  return { name, count }
}

function Collection({ wallet, getProvider, navigate }: Props) {
  const [reload, setReload] = useState(0)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [galleryAddress, setGalleryAddress] = useState(wallet.address ?? '')
  const ready = !!wallet.address && wallet.chainId === SEPOLIA_ID

  async function act(kind: 'claim' | 'validate') {
    const provider = getProvider()
    if (!ready || !wallet.address || !provider) return
    const account = wallet.address as Address
    setPending(true); setError('')
    const transact = (action: Parameters<typeof sendAction>[2], label: string) =>
      runTransaction(provider, account, action, label)

    try {
      if (kind === 'claim') {
        await transact('claimAToken', 'Création du NFT')
        setStatus('NFT créé avec succès. Tu peux maintenant valider tes points.')
      } else {
        const balance = await client.readContract({ address: BAYC, abi: baycAbi, functionName: 'balanceOf', args: [account] })
        if (balance === 0n) throw new Error('Tu dois détenir au moins un FakeBAYC pour valider cet exercice.')
        const completed = await client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: 'exerciseProgression', args: [account, 1n] })
        if (completed) { setStatus('Cet exercice est déjà validé pour cette adresse.'); return }
        const submitted = await client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: 'hasSubmitted', args: [account] })
        if (!submitted) await transact('submitExercise', 'Inscription au TD')
        await transact('ex1_claimedFakeBAYC', 'Validation FakeBAYC')
        const verified = await client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: 'exerciseProgression', args: [account, 1n] })
        if (!verified) throw new Error('La validation n’a pas été confirmée par l’Evaluator.')
        setStatus('Exercice FakeBAYC validé : 2 points attribués.')
      }
      setReload((value) => value + 1)
    } catch (cause) { setError(transactionError(cause)); setStatus('') }
    finally { setPending(false) }
  }

  return <>
    <CollectionInfo key={reload} />
    <section>
      <h2>Créer un FakeBAYC</h2>
      <p>La création est gratuite ; les frais de transaction sont payés en ETH Sepolia.</p>
      {!ready && <p>Connecte ton wallet sur Sepolia pour continuer.</p>}
      <div className="actions">
        <button disabled={!ready || pending} onClick={() => void act('claim')}>Créer mon NFT</button>
        <button disabled={!ready || pending} onClick={() => void act('validate')}>Valider mes points</button>
      </div>
      <p>L’inscription à l’Evaluator sera proposée si nécessaire avant la validation.</p>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
    <section>
      <h2>Explorer une galerie</h2>
      <form onSubmit={(event) => {
        event.preventDefault()
        if (!isAddress(galleryAddress, { strict: false })) { setError('Saisis une adresse Ethereum valide.'); return }
        navigate(`/fakeBayc/gallery/${galleryAddress}`)
      }}>
        <label htmlFor="gallery-address">Adresse du propriétaire</label>
        <input id="gallery-address" value={galleryAddress} onChange={(event) => setGalleryAddress(event.target.value.trim())} placeholder="0x…" required />
        <button type="submit">Voir les NFT</button>
      </form>
      {wallet.address && <p><Link to={`/fakeBayc/gallery/${wallet.address}`} navigate={navigate}>Voir ma galerie</Link></p>}
    </section>
  </>
}

function CollectionInfo() {
  const result = useLoad(readCollection)
  return <section aria-label="Collection FakeBAYC">
    {result.error ? <p role="alert" className="error">Lecture impossible : {result.error}</p> : result.value ? <dl>
      <dt>Collection</dt><dd>{result.value.name}</dd>
      <dt>Total de NFT créés</dt><dd>{result.value.count.toString()}</dd>
    </dl> : <p role="status">Chargement de la collection…</p>}
  </section>
}

async function tokenData(id: bigint, signal: AbortSignal): Promise<{ owner: Address; metadata?: Metadata; metadataError?: string }> {
  let owner: Address
  try {
    owner = await client.readContract({ address: BAYC, abi: baycAbi, functionName: 'ownerOf', args: [id] })
  } catch (cause) {
    if (cause instanceof BaseError && cause.walk((error) => error instanceof ContractFunctionRevertedError) instanceof ContractFunctionRevertedError) {
      throw new Error(`Le NFT #${id} n’existe pas.`)
    }
    throw cause
  }
  try {
    const uri = await client.readContract({ address: BAYC, abi: baycAbi, functionName: 'tokenURI', args: [id] })
    return { owner, metadata: await loadMetadata(uri, signal) }
  } catch (cause) { return { owner, metadataError: message(cause) } }
}

function Token({ id, navigate }: { id: bigint; navigate: Props['navigate'] }) {
  const [loader] = useState(() => (signal: AbortSignal) => tokenData(id, signal))
  const result = useLoad(loader)
  return <section>
    <h2>FakeBAYC #{id.toString()}</h2>
    {result.error ? <p role="alert" className="error">{result.error}</p> : result.value ? <>
      <h3>{result.value.metadata?.name || `FakeBAYC #${id}`}</h3>
      <NftImage src={result.value.metadata?.image ?? null} name={result.value.metadata?.name || `FakeBAYC #${id}`} />
      <p>{result.value.metadata?.description || 'Aucune description disponible.'}</p>
      {result.value.metadataError && <p role="alert" className="error">NFT trouvé, mais métadonnées indisponibles : {result.value.metadataError}</p>}
      <p className="address">Propriétaire : {result.value.owner}</p>
      <Link to={`/fakeBayc/gallery/${result.value.owner}`} navigate={navigate}>Voir sa galerie</Link>
    </> : <p role="status">Chargement du NFT…</p>}
  </section>
}

function GalleryCard({ id, navigate }: { id: bigint; navigate: Props['navigate'] }) {
  const [loader] = useState(() => async (signal: AbortSignal) => {
    const uri = await client.readContract({ address: BAYC, abi: baycAbi, functionName: 'tokenURI', args: [id] })
    return loadMetadata(uri, signal)
  })
  const result = useLoad(loader)
  return <article className="nft-card">
    <NftImage src={result.value?.image ?? null} name={result.value?.name || `FakeBAYC #${id}`} />
    <Link to={`/fakeBayc/${id}`} navigate={navigate}>{result.value?.name || `FakeBAYC #${id}`}</Link>
    <p>Token #{id.toString()}</p>
    {result.error && <p>Métadonnées indisponibles.</p>}
  </article>
}

function Gallery({ address, navigate }: { address: Address; navigate: Props['navigate'] }) {
  const [page, setPage] = useState(0)
  return <section>
    <h2>Galerie FakeBAYC</h2>
    <p className="address">{address}</p>
    <GalleryPage key={page} address={address} page={page} setPage={setPage} navigate={navigate} />
  </section>
}

function GalleryPage({ address, page, setPage, navigate }: { address: Address; page: number; setPage: (page: number) => void; navigate: Props['navigate'] }) {
  const [loader] = useState(() => async () => {
    const blockNumber = await client.getBlockNumber()
    const balance = await client.readContract({ address: BAYC, abi: baycAbi, functionName: 'balanceOf', args: [address], blockNumber })
    const start = BigInt(page) * 24n
    const length = Number(balance > start ? (balance - start > 24n ? 24n : balance - start) : 0n)
    const tokens = await Promise.all(Array.from({ length }, (_, index) => client.readContract({
      address: BAYC, abi: baycAbi, functionName: 'tokenOfOwnerByIndex', args: [address, start + BigInt(index)], blockNumber,
    })))
    return { balance, tokens }
  })
  const result = useLoad(loader)
  return result.error ? <p className="error" role="alert">Galerie indisponible : {result.error}</p> : result.value ? <>
    <p>{result.value.balance.toString()} NFT détenu(s).</p>
    {result.value.balance === 0n ? <p>Cette adresse ne possède aucun FakeBAYC.</p> : <>
      <div className="nft-grid">{result.value.tokens.map((id) => <GalleryCard key={id.toString()} id={id} navigate={navigate} />)}</div>
      <div className="actions">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
        <span>Page {page + 1}</span>
        <button disabled={BigInt(page + 1) * 24n >= result.value.balance} onClick={() => setPage(page + 1)}>Suivant</button>
      </div>
    </>}
  </> : <p role="status">Chargement des NFT…</p>
}

export default function FakeBayc(props: Props) {
  const parts = props.path.split('/').filter(Boolean)
  let id: bigint | undefined
  let routeError = ''
  if (parts.length === 2 && parts[1] !== 'gallery') {
    try { id = parseTokenId(parts[1]) } catch (cause) { routeError = message(cause) }
  } else if (parts[1] === 'gallery' && parts.length === 3) {
    if (!isAddress(parts[2], { strict: false })) routeError = 'Adresse Ethereum invalide.'
  } else if (parts.length !== 1) routeError = 'Cette page FakeBAYC n’existe pas.'
  return <div>
    <p><Link to="/fakeBayc" navigate={props.navigate}>Collection FakeBAYC</Link></p>
    {routeError ? <p role="alert" className="error">{routeError}</p>
      : parts.length === 1 ? <Collection {...props} />
      : id !== undefined ? <Token id={id} navigate={props.navigate} />
      : <Gallery address={parts[2] as Address} navigate={props.navigate} />}
  </div>
}
