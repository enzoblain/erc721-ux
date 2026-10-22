import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { connectBrowserWallet, subscribeWallet, switchToSepolia, SEPOLIA_ID, SEPOLIA_HEX, walletError } from '../src/wallet.ts'

const address = '0x73A50ECA0Ca4e70752a5aeFc7C7F02adC868D61F'

class Provider extends EventEmitter {
  calls = []
  constructor(respond) { super(); this.respond = respond }
  async request(args) { this.calls.push(args); return this.respond(args) }
}

test('browser connection requests accounts and reads the active chain', async () => {
  const provider = new Provider(({ method }) => method === 'eth_requestAccounts' ? [address] : SEPOLIA_HEX)
  assert.deepEqual(await connectBrowserWallet(provider), { address, chainId: SEPOLIA_ID })
  assert.deepEqual(provider.calls.map((c) => c.method), ['eth_requestAccounts', 'eth_chainId'])
})

test('account, chain and disconnect events update state; cleanup removes listeners', () => {
  const provider = new Provider(() => undefined)
  let account, chain, disconnected = false
  const cleanup = subscribeWallet(provider, (a) => { account = a }, (id) => { chain = id }, () => { disconnected = true })
  provider.emit('accountsChanged', [address]); assert.equal(account, address)
  provider.emit('accountsChanged', []); assert.equal(account, null)
  provider.emit('chainChanged', '0x1'); assert.equal(chain, 1)
  provider.emit('chainChanged', SEPOLIA_ID); assert.equal(chain, SEPOLIA_ID)
  provider.emit('disconnect'); assert.equal(disconnected, true)
  cleanup()
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) assert.equal(provider.listenerCount(event), 0)
})

test('known Sepolia network is switched without adding it', async () => {
  const provider = new Provider(({ method }) => method === 'eth_chainId' ? SEPOLIA_HEX : null)
  assert.equal(await switchToSepolia(provider, 'https://rpc.example'), SEPOLIA_ID)
  assert.deepEqual(provider.calls[0], { method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_HEX }] })
  assert.equal(provider.calls.some((c) => c.method === 'wallet_addEthereumChain'), false)
})

test('unknown network triggers add then another switch', async () => {
  let switches = 0
  const provider = new Provider(({ method }) => {
    if (method === 'wallet_switchEthereumChain' && ++switches === 1) throw { code: 4902 }
    return method === 'eth_chainId' ? SEPOLIA_HEX : null
  })
  await switchToSepolia(provider, 'https://rpc.example')
  assert.deepEqual(provider.calls.map((c) => c.method), ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain', 'eth_chainId'])
  assert.equal(provider.calls[1].params[0].chainId, SEPOLIA_HEX)
  assert.deepEqual(provider.calls[1].params[0].rpcUrls, ['https://rpc.example'])
})

test('a rejected switch does not try to add a network', async () => {
  const rejection = { code: 4001 }
  const provider = new Provider(() => { throw rejection })
  await assert.rejects(switchToSepolia(provider, 'https://rpc.example'), (error) => error === rejection)
  assert.equal(provider.calls.length, 1)
  assert.match(walletError(rejection), /refusée/)
})

test('wallet staying on another network produces an error', async () => {
  const provider = new Provider(({ method }) => method === 'eth_chainId' ? '0x1' : null)
  await assert.rejects(switchToSepolia(provider, 'https://rpc.example'), /pas basculé/)
})
