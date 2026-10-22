import { useState } from 'react'
import { BaseError, formatEther, isAddress } from 'viem'
import type { Address, Hash } from 'viem'
import { client, EVALUATOR, evaluatorAbi, NEFTURIANS, nefturiansAbi, sendAction } from './fakeBayc/client'
import { useLoad } from './useLoad'
import { SEPOLIA_ID, walletError } from './wallet'
import type { WalletProvider, WalletState } from './wallet'

type Props = { path: string; wallet: WalletState; getProvider: () => WalletProvider | null; navigate: (path: string) => void }
const readPrice = async () => client.readContract({ address: NEFTURIANS, abi: nefturiansAbi, functionName: 'tokenPrice' })

function Price() {
  const result = useLoad(readPrice)
  return result.error ? <p className="error" role="alert">Prix indisponible : {result.error}</p>
    : result.value !== undefined ? <p>Prix actuel : <strong>{formatEther(result.value)} ETH</strong>, hors frais de transaction.</p>
    : <p role="status">Chargement du prix…</p>
}

function AddressTokens({ address, page, setPage, navigate }: { address: Address; page: number; setPage: (page: number) => void; navigate: Props['navigate'] }) {
  const [loader] = useState(() => async () => {
    const blockNumber = await client.getBlockNumber()
    const balance = await client.readContract({ address: NEFTURIANS, abi: nefturiansAbi, functionName: 'balanceOf', args: [address], blockNumber })
    const start = BigInt(page) * 24n
    const length = Number(balance > start ? (balance - start > 24n ? 24n : balance - start) : 0n)
    const ids = await Promise.all(Array.from({ length }, (_, index) => client.readContract({
      address: NEFTURIANS, abi: nefturiansAbi, functionName: 'tokenOfOwnerByIndex', args: [address, start + BigInt(index)], blockNumber,
    })))
    return { balance, ids }
  })
  const result = useLoad(loader)
  return <section>
    <h2>NFT de cette adresse</h2><p className="address">{address}</p>
    {result.error ? <p className="error" role="alert">Lecture impossible : {result.error}</p> : result.value ? <>
      <p>{result.value.balance.toString()} FakeNefturians détenu(s).</p>
      {result.value.balance === 0n ? <p>Cette adresse ne possède aucun FakeNefturians.</p> : <>
        <ul>{result.value.ids.map((id) => <li key={id.toString()}>Token #{id.toString()}</li>)}</ul>
        <div className="actions">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
          <span>Page {page + 1}</span>
          <button disabled={BigInt(page + 1) * 24n >= result.value.balance} onClick={() => setPage(page + 1)}>Suivant</button>
        </div>
      </>}
    </> : <p role="status">Chargement des NFT…</p>}
    <p><a href="/fakeNefturians" onClick={(event) => { event.preventDefault(); navigate('/fakeNefturians') }}>Retour à la collection</a></p>
  </section>
}

export default function FakeNefturians({ path, wallet, getProvider, navigate }: Props) {
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [txs, setTxs] = useState<{ label: string; hash: Hash }[]>([])
  const [reload, setReload] = useState(0)
  const [address, setAddress] = useState(wallet.address ?? '')
  const [page, setPage] = useState(0)
  const ready = !!wallet.address && wallet.chainId === SEPOLIA_ID
  const parts = path.split('/').filter(Boolean)

  async function act(kind: 'buy' | 'validate') {
    const provider = getProvider()
    if (!ready || !provider || !wallet.address) return
    const account = wallet.address as Address
    setPending(true); setStatus(''); setError(''); setTxs([])
    const transact = async (action: Parameters<typeof sendAction>[2], label: string) => {
      setStatus(`${label} : confirme dans ton wallet.`)
      await sendAction(provider, account, action, (hash) => {
        setTxs((previous) => [...previous.filter((tx) => tx.label !== label), { label, hash }])
        setStatus(`${label} : confirmation sur Sepolia en cours…`)
      })
    }
    try {
      if (kind === 'buy') {
        await transact('buyAToken', 'Achat FakeNefturians')
        setStatus('Achat confirmé. Ton wallet détient le nouveau NFT.')
      } else {
        const balance = await client.readContract({ address: NEFTURIANS, abi: nefturiansAbi, functionName: 'balanceOf', args: [account] })
        if (balance === 0n) throw new Error('Tu dois détenir au moins un FakeNefturians avant de valider.')
        const completed = await client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: 'exerciseProgression', args: [account, 2n] })
        if (completed) { setStatus('Cet exercice est déjà validé pour cette adresse.'); return }
        const submitted = await client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: 'hasSubmitted', args: [account] })
        if (!submitted) await transact('submitExercise', 'Inscription au TD')
        await transact('ex2_boughtFakeNefturians', 'Validation FakeNefturians')
        const verified = await client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: 'exerciseProgression', args: [account, 2n] })
        if (!verified) throw new Error('La validation n’a pas été confirmée par l’Evaluator.')
        setStatus('Exercice FakeNefturians validé : 2 points attribués.')
      }
      setReload((value) => value + 1)
    } catch (cause) { setError(cause instanceof BaseError ? cause.shortMessage : walletError(cause)); setStatus('') }
    finally { setPending(false) }
  }

  if (parts.length > 1) {
    return parts.length === 2 && isAddress(parts[1], { strict: false })
      ? <AddressTokens key={`${parts[1]}:${page}`} address={parts[1] as Address} page={page} setPage={setPage} navigate={navigate} />
      : <p className="error" role="alert">Adresse Ethereum invalide ou page inexistante.</p>
  }
  return <>
    <section>
      <h2>Acheter un FakeNefturians</h2>
      <Price key={reload} />
      {!ready && <p>Connecte ton wallet sur Sepolia pour acheter ou valider.</p>}
      <div className="actions">
        <button disabled={!ready || pending} onClick={() => void act('buy')}>Acheter un NFT</button>
        <button disabled={!ready || pending} onClick={() => void act('validate')}>Valider mes points</button>
      </div>
      <p>Le prix est relu avant chaque achat et envoyé à buyAToken(). L’inscription à l’Evaluator sera proposée si nécessaire avant la validation.</p>
      {status && <p role="status">{status}</p>}
      {txs.map((tx) => <p key={tx.label}><a href={`https://sepolia.etherscan.io/tx/${tx.hash}`} target="_blank" rel="noreferrer">{tx.label} — voir la transaction</a></p>)}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    <section>
      <h2>Consulter les NFT d’une adresse</h2>
      <form onSubmit={(event) => {
        event.preventDefault()
        if (!isAddress(address, { strict: false })) { setError('Saisis une adresse Ethereum valide.'); return }
        navigate(`/fakeNefturians/${address}`)
      }}>
        <label htmlFor="nefturians-address">Adresse du propriétaire</label>
        <input id="nefturians-address" value={address} onChange={(event) => setAddress(event.target.value.trim())} placeholder="0x…" required />
        <button type="submit">Afficher les NFT</button>
      </form>
      {wallet.address && <p><a href={`/fakeNefturians/${wallet.address}`} onClick={(event) => { event.preventDefault(); navigate(`/fakeNefturians/${wallet.address}`) }}>Voir mes NFT</a></p>}
    </section>
  </>
}
