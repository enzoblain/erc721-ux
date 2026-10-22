export function parseTokenId(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error('Identifiant de NFT invalide.')
  const id = BigInt(value)
  if (id >= 2n ** 256n) throw new Error('Identifiant de NFT trop grand.')
  return id
}

export function resourceUrl(value: string): string {
  if (value.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${value.slice(7).replace(/^ipfs\//, '')}`
  }
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Adresse de ressource non prise en charge.')
  return url.href
}

export interface Metadata { name: string; description: string; image: string | null }

export async function loadMetadata(uri: string, signal?: AbortSignal): Promise<Metadata> {
  const response = await fetch(resourceUrl(uri), {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Métadonnées indisponibles (HTTP ${response.status}).`)
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object') throw new Error('Métadonnées invalides.')
  const item = data as Record<string, unknown>
  let image: string | null = null
  if (typeof item.image === 'string' && item.image) {
    try { image = resourceUrl(new URL(item.image, resourceUrl(uri)).href) } catch { /* Invalid images use the placeholder. */ }
  }
  return {
    name: typeof item.name === 'string' ? item.name : '',
    description: typeof item.description === 'string' ? item.description : '',
    image,
  }
}
