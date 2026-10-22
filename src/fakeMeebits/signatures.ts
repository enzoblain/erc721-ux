export interface SignedToken { tokenId: bigint; signature: `0x${string}` }

export function parseSignatures(input: unknown): SignedToken[] {
  if (!Array.isArray(input)) throw new Error('Le fichier de signatures doit contenir une liste.')
  const seen = new Set<string>()
  return input.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Entrée de signature invalide.')
    const { tokenNumber, signature } = item as Record<string, unknown>
    if (typeof tokenNumber !== 'number' || !Number.isSafeInteger(tokenNumber) || tokenNumber < 0) throw new Error('Identifiant signé invalide.')
    if (typeof signature !== 'string' || !/^0x[0-9a-f]{130}$/i.test(signature)) throw new Error(`Signature invalide pour le token ${tokenNumber}.`)
    const key = String(tokenNumber)
    if (seen.has(key)) throw new Error(`Signature dupliquée pour le token ${tokenNumber}.`)
    seen.add(key)
    return { tokenId: BigInt(tokenNumber), signature: signature as `0x${string}` }
  })
}
