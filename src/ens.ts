interface EnsResolver {
  reverse(address: string): Promise<string | null>
  forward(name: string): Promise<string | null>
}
export async function verifiedEnsName(address: string, resolver: EnsResolver): Promise<string | null> {
  try {
    const name = await resolver.reverse(address)
    if (!name) return null
    const resolved = await resolver.forward(name)
    return resolved?.toLowerCase() === address.toLowerCase() ? name : null
  } catch { return null }
}
