import { transact as runTransaction } from '../transactionStore'
import { transactionError } from '../transactionState'
import { useState } from 'react'
import { encodeAbiParameters, keccak256, recoverMessageAddress } from 'viem'
import type { Address } from 'viem'
import { client, CLAIMER, MEEBITS, EVALUATOR, baycAbi, claimerAbi, evaluatorAbi, sendAction } from '../fakeBayc/client'
import { SEPOLIA_ID } from '../wallet'
import type { WalletProvider, WalletState } from '../wallet'
import { useLoad } from '../useLoad'
import signatureFile from './signatures.json'
import { parseSignatures } from './signatures'
import type { SignedToken } from './signatures'

const signatures = parseSignatures(signatureFile)
type Props = { wallet: WalletState; getProvider: () => WalletProvider | null }

async function readAvailable() {
  const blockNumber = await client.getBlockNumber()
  const [maxId, collection] = await Promise.all([
    client.readContract({ address: CLAIMER, abi: claimerAbi, functionName: 'maxTokenId', blockNumber }),
    client.readContract({ address: CLAIMER, abi: claimerAbi, functionName: 'fakeMeebits', blockNumber }),
  ])
  if (collection.toLowerCase() !== MEEBITS.toLowerCase()) throw new Error('Le claimer pointe vers une autre collection FakeMeebits.')
  const candidates = signatures.filter((item) => item.tokenId <= maxId)
  const claimed = await client.multicall({
    contracts: candidates.map((item) => ({ address: CLAIMER, abi: claimerAbi, functionName: 'tokensThatWereClaimed' as const, args: [item.tokenId] as const })),
    allowFailure: false,
    blockNumber,
  })
  return { maxId, rows: candidates.map((item, index) => ({ ...item, claimed: claimed[index] })) }
}

function SignedClaim({ item, disabled, onClaim }: { item: SignedToken; disabled: boolean; onClaim: (item: SignedToken) => void }) {
  const [loader] = useState(() => async () => {
    const hash = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [MEEBITS, item.tokenId]))
    const signer = await recoverMessageAddress({ message: { raw: hash }, signature: item.signature })
    return client.readContract({ address: CLAIMER, abi: claimerAbi, functionName: 'whitelist', args: [signer] })
  })
  const result = useLoad(loader)
  return <>
    <label htmlFor="meebit-signature">Signature correspondante du fichier officiel</label>
    <textarea id="meebit-signature" value={item.signature} readOnly rows={4} />
    {result.error ? <p role="alert" className="error">Vérification de la signature impossible : {result.error}</p>
      : result.value === false ? <p role="alert" className="error">Cette signature officielle n’est pas autorisée par le Claimer déployé. Une signature à jour ou une correction du contrat par l’enseignant est nécessaire.</p>
      : result.value === undefined ? <p role="status">Vérification du signataire…</p> : <p>Signature autorisée par le contrat.</p>}
    <button disabled={disabled || result.value !== true} onClick={() => onClaim(item)}>Réclamer le NFT #{item.tokenId.toString()}</button>
  </>
}

function Picker({ disabled, onClaim }: { disabled: boolean; onClaim: (item: SignedToken) => void }) {
  const result = useLoad(readAvailable)
  const [selectedId, setSelectedId] = useState('')
  if (result.error) return <p role="alert" className="error">Disponibilités indisponibles : {result.error}</p>
  if (!result.value) return <p role="status">Vérification des signatures et des NFT déjà réclamés…</p>
  const available = result.value.rows.filter((item) => !item.claimed)
  const selected = available.find((item) => item.tokenId.toString() === selectedId) ?? available[0]
  return <>
    <p>{available.length} NFT disponible(s) parmi {result.value.rows.length} signatures fournies. Limite du contrat : #{result.value.maxId.toString()}.</p>
    {selected ? <>
      <label htmlFor="meebit-token">NFT à réclamer</label>
      <select id="meebit-token" value={selected.tokenId.toString()} disabled={disabled} onChange={(event) => setSelectedId(event.target.value)}>
        {result.value.rows.map((item) => <option key={item.tokenId.toString()} value={item.tokenId.toString()} disabled={item.claimed}>
          #{item.tokenId.toString()} — {item.claimed ? 'déjà réclamé' : 'disponible'}
        </option>)}
      </select>
      <SignedClaim key={selected.tokenId.toString()} item={selected} disabled={disabled} onClaim={onClaim} />
    </> : <p>Tous les NFT disposant d’une signature dans le fichier sont déjà réclamés.</p>}
    <p>La disponibilité est vérifiée sur la chaîne puis à nouveau avant l’envoi. Un autre utilisateur peut réclamer le NFT entre-temps.</p>
  </>
}

export default function FakeMeebits({ wallet, getProvider }: Props) {
  const [reload, setReload] = useState(0)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const ready = !!wallet.address && wallet.chainId === SEPOLIA_ID

  async function act(item?: SignedToken) {
    const provider = getProvider()
    if (!ready || !provider || !wallet.address) return
    const account = wallet.address as Address
    setPending(true); setError(''); setStatus('')
    const transact = (action: Parameters<typeof sendAction>[2], label: string, claim?: SignedToken) =>
      runTransaction(provider, account, action, label, claim)

    try {
      if (item) {
        await transact('claimMeebit', 'Claim FakeMeebits', item)
        const owner = await client.readContract({ address: MEEBITS, abi: baycAbi, functionName: 'ownerOf', args: [item.tokenId] })
        if (owner.toLowerCase() !== account.toLowerCase()) throw new Error('Le NFT a été créé, mais le propriétaire ne correspond pas au compte connecté.')
        setStatus(`FakeMeebits #${item.tokenId} reçu. Tu peux valider tes points.`)
      } else {
        const balance = await client.readContract({ address: MEEBITS, abi: baycAbi, functionName: 'balanceOf', args: [account] })
        if (balance === 0n) throw new Error('Tu dois détenir au moins un FakeMeebits avant de valider.')
        const completed = await client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: 'exerciseProgression', args: [account, 3n] })
        if (completed) { setStatus('Cet exercice est déjà validé pour cette adresse.'); return }
        const submitted = await client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: 'hasSubmitted', args: [account] })
        if (!submitted) await transact('submitExercise', 'Inscription au TD')
        await transact('ex3_claimedFakeMeebits', 'Validation FakeMeebits')
        const verified = await client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: 'exerciseProgression', args: [account, 3n] })
        if (!verified) throw new Error('La validation n’a pas été confirmée par l’Evaluator.')
        setStatus('Exercice FakeMeebits validé : 2 points attribués.')
      }
    } catch (cause) { setError(transactionError(cause)); setStatus('') }
    finally { setPending(false); setReload((value) => value + 1) }
  }

  return <>
    <section>
      <h2>Réclamer un FakeMeebits</h2>
      <p>Choisis un NFT disponible. Sa signature est sélectionnée automatiquement depuis le fichier officiel.</p>
      <p>Aucun paiement demandé par cette page ; seuls les frais de transaction s’appliquent.</p>
      {!ready && <p>Connecte ton wallet sur Sepolia pour réclamer un NFT.</p>}
      <Picker key={reload} disabled={!ready || pending} onClaim={(item) => void act(item)} />
      <div className="actions"><button disabled={pending} onClick={() => setReload((value) => value + 1)}>Actualiser les disponibilités</button></div>
    </section>
    <section>
      <h2>Valider les points</h2>
      <p>Une fois ton FakeMeebits reçu, valide l’exercice avec le même wallet. L’inscription au TD sera proposée si nécessaire.</p>
      <button disabled={!ready || pending} onClick={() => void act()}>Valider mes points</button>
      {status && <p role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </>
}
