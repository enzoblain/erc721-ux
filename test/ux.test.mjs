import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifiedEnsName } from '../src/ens.ts'
import { assertConfirmed, transactionError } from '../src/transactionState.ts'
const address = '0x1234567890123456789012345678901234567890'
test('ENS primary name is displayed only after forward verification', async () => {
  assert.equal(await verifiedEnsName(address, { reverse: async () => 'test.eth', forward: async () => address }), 'test.eth')
  assert.equal(await verifiedEnsName(address, { reverse: async () => 'test.eth', forward: async () => '0xother' }), null)
})
test('ENS absence and RPC failures leave the raw-address fallback available', async () => {
  assert.equal(await verifiedEnsName(address, { reverse: async () => null, forward: async () => { throw Error('Must not run') } }), null)
  assert.equal(await verifiedEnsName(address, { reverse: async () => { throw Error('Offline') }, forward: async () => null }), null)
})
test('cancelled and replaced transactions never appear as successful actions', () => {
  assert.doesNotThrow(() => assertConfirmed('success', 'repriced'))
  assert.throws(() => assertConfirmed('success', 'cancelled'), /annulée/)
  assert.throws(() => assertConfirmed('success', 'replaced'), /remplacée/)
  assert.throws(() => assertConfirmed('reverted'), /refusé/)
})
test('wallet and contract errors are translated through nested causes', () => {
  assert.match(transactionError({ cause: { code: 4001 } }), /refusée/)
  assert.match(transactionError({ cause: { message: 'insufficient funds' } }), /Solde ETH Sepolia insuffisant/)
  assert.match(transactionError({ reason: 'Claimer: signer not whitelisted' }), /signature/)
  assert.match(transactionError({ shortMessage: 'HTTP request failed' }), /Etherscan/)
  assert.equal(transactionError(Error('Passe sur Sepolia avant de continuer.')), 'Passe sur Sepolia avant de continuer.')
})
