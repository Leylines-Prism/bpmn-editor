// Catalogue des modèles du chat intégré (mcp/models.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCatalog, parseModelList } from '../mcp/models.js'

test('parseModelList reads ids with optional labels', () => {
  assert.deepEqual(parseModelList(' a=Model A, b ,,c= '), [
    { id: 'a', label: 'Model A' },
    { id: 'b', label: 'b' },
    { id: 'c', label: 'c' },
  ])
  assert.deepEqual(parseModelList(undefined), [])
  assert.deepEqual(parseModelList('=No id'), [])
})

test('buildCatalog lists nothing without any provider', () => {
  assert.deepEqual(buildCatalog({}), { models: [], defaultKey: null, warnings: [] })
})

test('buildCatalog only lists configured providers and never exposes keys', () => {
  const { models, defaultKey } = buildCatalog({ ANTHROPIC_API_KEY: 'secret', ANTHROPIC_MODELS: 'm1=One,m2' })
  assert.deepEqual(models.map((m) => m.key), ['anthropic:m1', 'anthropic:m2'])
  assert.equal(defaultKey, 'anthropic:m1')
  assert.ok(!JSON.stringify(models).includes('secret'))
})

test('CHAT_MODEL picks the default model by key or by id', () => {
  const env = { MISTRAL_API_KEY: 'k', MISTRAL_MODELS: 'small', ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODELS: 'big' }
  assert.equal(buildCatalog({ ...env, CHAT_MODEL: 'big' }).defaultKey, 'anthropic:big')
  assert.equal(buildCatalog({ ...env, CHAT_MODEL: 'mistral:small' }).defaultKey, 'mistral:small')
})

test('an unknown CHAT_MODEL keeps the first model and gives a warning', () => {
  const { defaultKey, warnings } = buildCatalog({ MISTRAL_API_KEY: 'k', MISTRAL_MODELS: 'small', CHAT_MODEL: 'nope' })
  assert.equal(defaultKey, 'mistral:small')
  assert.equal(warnings.length, 1)
})
