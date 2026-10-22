import { useSyncExternalStore } from 'react'
import { transactionStore } from './transactionStore'
const labels = {
  preparing: 'Vérification des conditions…', wallet: 'À confirmer dans ton wallet…',
  pending: 'Envoyée · confirmation sur Sepolia en cours…', success: 'Transaction confirmée avec succès',
  error: 'Action non confirmée',
}
export default function Transactions() {
  const entries = useSyncExternalStore(transactionStore.subscribe, transactionStore.getSnapshot)
  if (!entries.length) return null
  return <section aria-label="Suivi des transactions">
    <h2>Mes transactions</h2>
    <ol className="transaction-list">{entries.map((tx) => <li key={tx.id} className={`transaction transaction-${tx.stage}`}>
      <h3>{tx.label}</h3>
      <p role="status">{labels[tx.stage]}</p>
      <p className="address">Wallet : {tx.account}</p>
      {tx.error && <p role="alert" className="error">{tx.error}</p>}
      {tx.hash && <a href={`https://sepolia.etherscan.io/tx/${tx.hash}`} target="_blank" rel="noreferrer">{tx.stage === 'success' ? 'Voir la transaction confirmée sur Etherscan' : 'Vérifier la transaction sur Etherscan'}</a>}
    </li>)}</ol>
  </section>
}
