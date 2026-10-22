import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseSignatures } from '../src/fakeMeebits/signatures.ts'

const signature = '0x' + 'a'.repeat(130)
test('official signatures have unique token IDs and matching valid byte lengths', async () => {
  const data = JSON.parse(await readFile(new URL('../src/fakeMeebits/signatures.json', import.meta.url)))
  const rows = parseSignatures(data)
  assert.equal(rows.length, 100)
  assert.equal(rows[0].tokenId, 0n)
  assert.equal(rows[99].tokenId, 99n)
  assert.equal(rows[42].signature, data[42].signature)
})
test('malformed and duplicated signatures cannot enter the picker', () => {
  for (const input of [null, [{}], [{ tokenNumber: -1, signature }], [{ tokenNumber: 1, signature: '0x1234' }], [{ tokenNumber: 2, signature }, { tokenNumber: 2, signature }]]) {
    assert.throws(() => parseSignatures(input))
  }
})
