// Liste des modèles d'un fournisseur (src/ai/providers.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS, listModels, providerBaseUrl } from '../src/ai/providers.js'

const fakeFetch = (body, seen) => async (url, init) => {
  seen.push({ url, init })
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

test('providers are listed as Anthropic, OpenAI, Mistral, xAI, Ollama, then compatible servers', () => {
  assert.deepEqual(PROVIDERS.map((p) => p.id), ['anthropic', 'openai', 'mistral', 'xai', 'ollama', 'compat'])
})

test('xAI models come from /language-models, without image or video models', async () => {
  const seen = []
  const models = await listModels({
    format: 'openai',
    baseUrl: 'https://api.x.ai/v1/',
    apiKey: 'xai-test',
    fetch: fakeFetch({ models: [
      { id: 'grok-4.7', input_modalities: ['text', 'image'], output_modalities: ['text'] },
      { id: 'grok-imagine-image', input_modalities: ['text'], output_modalities: ['image'] },
      { id: 'grok-4.3', output_modalities: ['text'] },
    ] }, seen),
  })
  assert.equal(seen[0].url, 'https://api.x.ai/v1/language-models')
  assert.equal(seen[0].init.headers.Authorization, 'Bearer xai-test')
  assert.deepEqual(models.map((m) => m.id), ['grok-4.3', 'grok-4.7'])
})

test('other OpenAI-compatible providers keep /models', async () => {
  const seen = []
  await listModels({ format: 'openai', baseUrl: 'https://api.openai.com/v1', fetch: fakeFetch({ data: [{ id: 'gpt' }] }, seen) })
  assert.equal(seen[0].url, 'https://api.openai.com/v1/models')
})

test('an Ollama address without a path, or in /api, points to its OpenAI-compatible API under /v1', () => {
  assert.equal(providerBaseUrl('ollama', 'http://localhost:11434'), 'http://localhost:11434/v1')
  assert.equal(providerBaseUrl('ollama', 'http://localhost:11434/'), 'http://localhost:11434/v1')
  assert.equal(providerBaseUrl('ollama', ' http://127.0.0.1:11434/api/ '), 'http://127.0.0.1:11434/v1')
  assert.equal(providerBaseUrl('ollama', 'http://localhost:11434/v1/'), 'http://localhost:11434/v1')
  assert.equal(providerBaseUrl('ollama', 'https://ollama.example.com/proxy/v1'), 'https://ollama.example.com/proxy/v1')
  assert.equal(providerBaseUrl('ollama', 'not an address'), 'not an address')
  // Les autres fournisseurs gardent leur adresse.
  assert.equal(providerBaseUrl('compat', 'http://localhost:4000'), 'http://localhost:4000')
})

test('Ollama models are listed from /v1/models', async () => {
  const seen = []
  const models = await listModels({
    format: 'openai',
    baseUrl: providerBaseUrl('ollama', 'http://localhost:11434'),
    fetch: fakeFetch({ object: 'list', data: [{ id: 'qwen3:8b', object: 'model', owned_by: 'library' }] }, seen),
  })
  assert.equal(seen[0].url, 'http://localhost:11434/v1/models')
  assert.deepEqual(models.map((m) => m.id), ['qwen3:8b'])
})

test('a 400 about images or PDF says the model cannot read them', async () => {
  const { attachmentRefused, describeProviderError } = await import('../src/ai/errors.js')
  assert.match(attachmentRefused({ status: 400, message: 'Image input is not supported for this model' }), /cannot read images/)
  assert.match(attachmentRefused({ status: 400, message: 'Invalid content: file_data is not supported' }, 'fr'), /ne sait pas lire les PDF/)
  assert.equal(attachmentRefused({ status: 400, message: 'max_tokens is too large' }), null)
  assert.equal(attachmentRefused({ status: 500, message: 'image' }), null)
  assert.match(describeProviderError({ status: 400, message: 'model does not support vision' }, { label: 'X' }), /cannot read images/)
})

test('a size, page or format limit is not reported as "cannot read"', async () => {
  const { attachmentRefused } = await import('../src/ai/errors.js')
  assert.match(attachmentRefused({ status: 400, message: 'image exceeds 5 MB maximum: 5308416 bytes > 5242880 bytes' }), /limits/)
  assert.match(attachmentRefused({ status: 400, message: 'A maximum of 100 PDF pages may be provided.' }), /limits/)
  assert.match(attachmentRefused({ status: 400, message: 'Unsupported image format: image/webp' }), /file format/)
})
