// Pièces jointes et images d'outils dans la boucle du chat (src/ai/chat-loop.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { HISTORY_BUDGET, createToolSet, lightenHistory, runOpenAITurn } from '../src/ai/chat-loop.js'

const toolSet = createToolSet(z)
const quiet = { emit: () => {}, log: () => {} }
const IMAGE = { image: { mediaType: 'image/png', data: 'iVBORw0KGgo=', width: 10, height: 10 } }
const PDF = { kind: 'pdf', mediaType: 'application/pdf', name: 'a.pdf', data: 'JVBERi0=' }

// Client factice : rejoue des réponses et garde les requêtes reçues.
function fakeClient(steps) {
  const requests = []
  return {
    requests,
    async stream(body) {
      requests.push(structuredClone(body))
      const step = steps.shift()
      if (step instanceof Error) throw step
      return { content: step.content || '', toolCalls: step.toolCalls || [], finishReason: step.toolCalls ? 'tool_calls' : 'stop' }
    },
  }
}
const imageCall = { toolCalls: [{ id: 'c1', name: 'get_diagram_image', arguments: '{}' }] }
const parts = (messages) => messages.flatMap((m) => (Array.isArray(m.content) ? m.content.map((p) => p.type) : []))

test('tool images leave the history after the turn, attachments stay', async () => {
  const conv = { messages: [] }
  const client = fakeClient([imageCall, { content: 'done' }, { content: 'second' }])
  await runOpenAITurn({ client, model: 'm', conv, text: 'draw', attachments: [PDF], toolSet, executeTool: async () => IMAGE, ...quiet })
  // Pendant le tour : le PDF, puis l'image de l'outil dans un message utilisateur.
  assert.ok(parts(client.requests[1].messages).includes('file'))
  assert.ok(parts(client.requests[1].messages).includes('image_url'))
  // Après le tour : le PDF reste pour les questions suivantes, l'image de l'outil part.
  assert.deepEqual(parts(conv.messages).filter((t) => t !== 'text'), ['file'])
  await runOpenAITurn({ client, model: 'm', conv, text: 'again', toolSet, executeTool: async () => IMAGE, ...quiet })
  assert.deepEqual(parts(client.requests[2].messages).filter((t) => t !== 'text'), ['file'])
})

test('a model that refuses the tool image goes on without it', async () => {
  const conv = { messages: [] }
  const refused = Object.assign(new Error('model does not support image input'), { status: 400 })
  const client = fakeClient([imageCall, refused, { content: 'read with get_shapes' }])
  await runOpenAITurn({ client, model: 'm', conv, text: 'look', toolSet, executeTool: async () => IMAGE, ...quiet })
  assert.equal(conv.noToolImages, true)
  assert.deepEqual(parts(client.requests[2].messages).filter((t) => t === 'image_url'), [])
  assert.equal(conv.messages.at(-1).content, 'read with get_shapes')
})

test('old attachments go once the history is over budget', () => {
  const big = (text) => ({ role: 'user', content: [{ type: 'image', source: { data: 'x'.repeat(HISTORY_BUDGET * 0.6) } }, { type: 'text', text }] })
  const messages = [
    big('old'),
    { role: 'assistant', content: 'ok' },
    big('new'),
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: [{ type: 'image', source: {} }, { type: 'text', text: 'cap' }] }] },
  ]
  const out = lightenHistory(messages)
  assert.deepEqual(out[0].content.map((p) => p.type), ['text', 'text'])
  assert.deepEqual(out[2].content.map((p) => p.type), ['image', 'text'])
  assert.deepEqual(out[3].content[0].content.map((p) => p.type), ['text', 'text'])
  assert.equal(out[1], messages[1])
})
