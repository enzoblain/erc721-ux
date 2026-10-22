import { useEffect, useState } from 'react'
import { BaseError } from 'viem'
import { walletError } from './wallet'

export function useLoad<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{ value?: T; error?: string }>({})
  useEffect(() => {
    const abort = new AbortController()
    void loader(abort.signal).then((value) => {
      if (!abort.signal.aborted) setResult({ value })
    }).catch((cause: unknown) => {
      if (!abort.signal.aborted) setResult({ error: cause instanceof BaseError ? cause.shortMessage : walletError(cause) })
    })
    return () => abort.abort()
  }, [loader])
  return result
}
