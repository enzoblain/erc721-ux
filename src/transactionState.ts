export type TransactionStage = 'preparing' | 'wallet' | 'pending' | 'success'
export interface TransactionUpdate { stage: TransactionStage; hash?: `0x${string}` }

export function assertConfirmed(status: string, replacement?: string) {
  if (replacement === 'cancelled') throw new Error('Transaction annulée dans le wallet. Aucune action validée.')
  if (replacement === 'replaced') throw new Error('Transaction remplacée par une autre action. Relance la demande si nécessaire.')
  if (status !== 'success') throw new Error('Le contrat a refusé la transaction sur Sepolia. Les frais de réseau peuvent être débités.')
}

export function transactionError(error: unknown): string {
  let current: unknown = error
  const parts: string[] = []
  for (let depth = 0; current && typeof current === 'object' && depth < 10; depth++) {
    const item = current as { code?: number; message?: string; shortMessage?: string; reason?: string; cause?: unknown }
    if (item.code === 4001) return 'Demande refusée dans le wallet. Tu peux réessayer.'
    if (item.code === -32002) return 'Une demande attend déjà ta confirmation. Ouvre ton wallet.'
    parts.push(item.message ?? '', item.shortMessage ?? '', item.reason ?? '')
    current = item.cause
  }
  const text = parts.join(' ').toLowerCase()
  if (/user rejected|user denied|rejected the request/.test(text)) return 'Demande refusée dans le wallet. Tu peux réessayer.'
  if (/insufficient funds|exceeds the balance/.test(text)) return 'Solde ETH Sepolia insuffisant pour payer le montant et les frais de réseau.'
  if (/signer not whitelisted/.test(text)) return 'La signature n’est pas autorisée par le Claimer. Une signature à jour est nécessaire.'
  if (/token already claimed/.test(text)) return 'Ce NFT a déjà été réclamé. Actualise les disponibilités et choisis-en un autre.'
  if (/insufficient payment/.test(text)) return 'Le prix demandé n’est pas couvert. Actualise la page avant de réessayer.'
  if (/already submitted/.test(text)) return 'Ce wallet est déjà inscrit. Relance la validation des points.'
  if (/no submission/.test(text)) return 'Inscris ce wallet au TD avant de valider les points.'
  if (/no .* held/.test(text)) return 'Ce wallet ne possède pas le NFT nécessaire pour valider cet exercice.'
  if (/timeout|timed out|fetch failed|failed to fetch|network request|http request/.test(text)) return 'Le réseau ne répond pas. Si une transaction a été envoyée, vérifie son état sur Etherscan avant de réessayer.'
  if (/reverted|execution revert/.test(text)) return 'Le contrat a refusé cette action. Vérifie les conditions de l’exercice et actualise les données.'
  // Preserve our short, actionable application messages; hide verbose SDK diagnostics.
  if (error instanceof Error && error.name === 'Error' && error.message.length < 240) return error.message
  return 'La demande a échoué. Vérifie ton wallet et ta connexion, puis réessaie.'
}
