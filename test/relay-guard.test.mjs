// Garde du relais des fournisseurs (mcp/relay-guard.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRelayHost, isForbiddenAddress } from '../mcp/relay-guard.js'

test('isForbiddenAddress blocks link-local addresses in every notation', () => {
  for (const address of [
    '169.254.169.254',
    'fe80::1',
    '[fe80::1%eth0]',
    '::ffff:169.254.169.254',
    '::ffff:a9fe:a9fe',
    '[::ffff:a9fe:a9fe]',
    '0:0:0:0:0:ffff:a9fe:a9fe',
    '64:ff9b::a9fe:a9fe',
    'fd00:ec2::254',
  ]) {
    assert.equal(isForbiddenAddress(address), true, address)
  }
})

test('isForbiddenAddress lets other addresses through', () => {
  for (const address of ['127.0.0.1', '192.168.1.10', '::1', '::ffff:7f00:1', '2001:db8::1', 'api.example.com']) {
    assert.equal(isForbiddenAddress(address), false, address)
  }
})

test('checkRelayHost checks every address a name resolves to', async () => {
  const resolve = (answers) => async () => answers.map((address) => ({ address }))
  await assert.rejects(checkRelayHost('http://meta.example.com/v1', { resolve: resolve(['169.254.169.254']) }), /not allowed/)
  await assert.rejects(checkRelayHost('http://dual.example.com/v1', { resolve: resolve(['203.0.113.5', '::ffff:169.254.169.254']) }), /not allowed/)
  await assert.rejects(checkRelayHost('http://metadata.google.internal/'), /not allowed/)
  await assert.rejects(checkRelayHost('http://[::ffff:169.254.169.254]/'), /not allowed/)
  await checkRelayHost('http://api.example.com/v1', { resolve: resolve(['203.0.113.5']) })
  await checkRelayHost('http://localhost:11434/v1', { resolve: resolve(['127.0.0.1']) })
})
