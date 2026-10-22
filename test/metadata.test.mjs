import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTokenId, resourceUrl, loadMetadata } from '../src/fakeBayc/metadata.ts'

test('token zero and uint256 boundaries; malformed identifiers are rejected', () => {
  assert.equal(parseTokenId('0'), 0n)
  assert.equal(parseTokenId((2n ** 256n - 1n).toString()), 2n ** 256n - 1n)
  for (const id of ['-1', 'abc', '1.2', '1e3', '', (2n ** 256n).toString()]) assert.throws(() => parseTokenId(id))
})
test('IPFS conversion and unsafe URL rejection', () => {
  assert.equal(resourceUrl('ipfs://ipfs/cid/file.json'), 'https://ipfs.io/ipfs/cid/file.json')
  assert.equal(resourceUrl('https://example.com/1'), 'https://example.com/1')
  assert.throws(() => resourceUrl('javascript:alert(1)'))
})
test('metadata supports IPFS images and missing fields', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ name: 'Ape', description: 'Description', image: 'ipfs://cid/1.png' }))
  assert.deepEqual(await loadMetadata('https://example.com/1'), { name: 'Ape', description: 'Description', image: 'https://ipfs.io/ipfs/cid/1.png' })
})
test('metadata errors remain errors instead of pretending a token is missing', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 503 }))
  await assert.rejects(loadMetadata('https://example.com/1'), /503/)
})
