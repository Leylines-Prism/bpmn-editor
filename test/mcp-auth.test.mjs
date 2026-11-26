import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mcpAccess } from '../mcp/auth.js'

test('local server stays open without a token', () => {
  assert.equal(mcpAccess({ host: '127.0.0.1', allowedHosts: ['bpmn.example.com'] }).locked, false)
  assert.equal(mcpAccess({ host: '0.0.0.0', allowedHosts: ['localhost', '127.0.0.1'] }).locked, false)
  assert.equal(mcpAccess({ host: '0.0.0.0' }).locked, false)
})

test('non-local host name without a token closes /mcp', () => {
  const access = mcpAccess({ host: '0.0.0.0', allowedHosts: ['localhost', 'bpmn.example.com'] })
  assert.deepEqual(access.publicHosts, ['bpmn.example.com'])
  assert.equal(access.locked, true)
})

test('a token or MCP_AUTH=off opens it', () => {
  const base = { host: '0.0.0.0', allowedHosts: ['bpmn.example.com'] }
  assert.equal(mcpAccess({ ...base, token: 'abc' }).locked, false)
  for (const auth of ['off', 'OFF', 'false', '0', 'no', ' off ']) {
    const access = mcpAccess({ ...base, auth })
    assert.equal(access.locked, false)
    assert.equal(access.openOnPurpose, true)
  }
  assert.equal(mcpAccess({ ...base, auth: 'on' }).locked, true)
})

test('server models behind OPENAI_BASE_URL only send PDF to the OpenAI API', async () => {
  const { ChatService } = await import('../mcp/chat.js')
  const saved = { ...process.env }
  try {
    process.env.OPENAI_MODELS = 'llama3'
    process.env.OPENAI_BASE_URL = 'http://host.docker.internal:11434/v1'
    assert.equal(new ChatService({ bridge: {} }).providerId('openai'), 'compat')
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
    assert.equal(new ChatService({ bridge: {} }).providerId('openai'), 'openai')
    delete process.env.OPENAI_BASE_URL
    assert.equal(new ChatService({ bridge: {} }).providerId('openai'), 'openai')
    assert.equal(new ChatService({ bridge: {} }).providerId('mistral'), 'mistral')
    process.env.OPENAI_BASE_URL = 'https://api.x.ai/v1'
    assert.equal(new ChatService({ bridge: {} }).providerId('openai'), 'xai')
    process.env.OPENAI_BASE_URL = 'https://openrouter.ai/api/v1'
    assert.equal(new ChatService({ bridge: {} }).providerId('openai'), 'openai')
  } finally {
    process.env = saved
  }
})
