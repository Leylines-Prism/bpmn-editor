// Adresses locales d'un fournisseur (src/ai/local-address.js), pour le bandeau du chat.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLocalAddress } from '../src/ai/local-address.js'

test('local and private addresses are recognized', () => {
  for (const url of ['http://localhost:11434/v1', 'http://127.0.0.1:4000', 'http://ollama:11434/v1', 'http://192.168.1.20/v1', 'http://10.0.0.5', 'http://172.20.0.3', 'http://[::1]:8000', 'http://gpu.local/v1', 'http://100.101.1.2']) {
    assert.equal(isLocalAddress(url), true, url)
  }
})

test('public providers are not local', () => {
  for (const url of ['https://api.anthropic.com', 'https://api.openai.com/v1', 'https://api.mistral.ai/v1', 'http://172.32.0.1', 'http://8.8.8.8', 'not a url', '']) {
    assert.equal(isLocalAddress(url), false, url)
  }
})
