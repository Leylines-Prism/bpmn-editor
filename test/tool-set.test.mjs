// Outils de dessin du chat intégré (src/ai/chat-loop.js) : validation des arguments.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { createToolSet, runTool } from '../src/ai/chat-loop.js'

const toolSet = createToolSet(z)
const quiet = { emit: () => {}, log: () => {} }

test('every tool has a JSON schema for both API formats', () => {
  const names = toolSet.tools.map((t) => t.name)
  assert.ok(names.includes('add_shapes') && names.includes('connect_shapes'))
  for (const tool of toolSet.anthropic) assert.equal(tool.input_schema.type, 'object', tool.name)
  assert.deepEqual(toolSet.openai.map((t) => t.function.name), names)
})

test('an unknown tool is refused without running anything', async () => {
  let ran = false
  const result = await runTool({ toolSet, name: 'drop_database', input: {}, executeTool: () => (ran = true), ...quiet })
  assert.equal(result.isError, true)
  assert.equal(ran, false)
})

test('invalid arguments are refused before reaching the editor', async () => {
  let ran = false
  const result = await runTool({ toolSet, name: 'connect_shapes', input: { connections: 'nope' }, executeTool: () => (ran = true), ...quiet })
  assert.equal(result.isError, true)
  assert.equal(ran, false)
})

test('valid arguments run the tool and return its result as text', async () => {
  const result = await runTool({ toolSet, name: 'get_shapes', input: {}, executeTool: async () => ({ shapes: [] }), ...quiet })
  assert.deepEqual(result, { content: '{"shapes":[]}', isError: false })
})

test('an error thrown by the editor becomes a tool error', async () => {
  const result = await runTool({ toolSet, name: 'get_shapes', input: {}, executeTool: async () => { throw new Error('boom') }, ...quiet })
  assert.equal(result.isError, true)
  assert.match(result.content, /boom/)
})
