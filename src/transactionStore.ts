import { sendAction } from './fakeBayc/client'
import { transactionError } from './transactionState'
import type { TransactionStage } from './transactionState'
import type { Address, Hash } from 'viem'
import type { WalletProvider } from './wallet'

export interface TransactionEntry {
  id: string; label: string; account: Address
  stage: TransactionStage | 'error'; hash?: Hash; error?: string
}
let entries: TransactionEntry[] = []
const listeners = new Set<() => void>()
export const transactionStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  getSnapshot() { return entries },
}
function update(id: string, change: Partial<TransactionEntry>) {
  entries = entries.map((item) => item.id === id ? { ...item, ...change } : item)
  listeners.forEach((listener) => listener())
}
export async function transact(
  provider: WalletProvider, account: Address,
  action: Parameters<typeof sendAction>[2], label: string,
  claim?: Parameters<typeof sendAction>[4],
) {
  const id = crypto.randomUUID()
  entries = [...entries, { id, label, account, stage: 'preparing' }]
  listeners.forEach((listener) => listener())
  try {
    return await sendAction(provider, account, action, (change) => update(id, change), claim)
  } catch (cause) {
    update(id, { stage: 'error', error: transactionError(cause) })
    throw cause
  }
}
