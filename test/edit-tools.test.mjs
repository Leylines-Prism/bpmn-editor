// Outils de retouche : layout_diagram (ancien nom auto_layout), move_elements,
// duplicate_elements, undo et redo, pour le serveur MCP et le co-pilote.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { buildTools, INSTRUCTIONS } from '../src/ai/tools.js'
import { createToolSet } from '../src/ai/chat-loop.js'

const tools = buildTools(z)
const byName = Object.fromEntries(tools.map((t) => [t.name, t]))

test('the editing tools are declared with annotations, and auto_layout remains as a former name for MCP only', () => {
  for (const name of ['layout_diagram', 'auto_layout', 'move_elements', 'duplicate_elements', 'undo', 'redo']) {
    assert.ok(byName[name], name)
    assert.equal(byName[name].annotations.readOnlyHint, false, name)
    assert.ok(byName[name].description.length > 120, name)
  }
  assert.equal(byName.auto_layout.mcpOnly, true)
  assert.match(byName.auto_layout.description, /layout_diagram/)
  assert.equal(byName.undo.annotations.destructiveHint, true)
  assert.doesNotMatch(INSTRUCTIONS, /auto_layout/)
  assert.equal(new Set(tools.map((t) => t.name)).size, tools.length)
})

test('the co-pilot gets layout_diagram but not the former name', () => {
  const set = createToolSet(z)
  const names = set.anthropic.map((t) => t.name)
  assert.ok(names.includes('layout_diagram'))
  assert.ok(names.includes('move_elements'))
  assert.ok(!names.includes('auto_layout'))
  assert.equal(set.openai.length, names.length)
})

test('move_elements, duplicate_elements and undo validate their arguments', () => {
  const set = createToolSet(z)
  assert.ok(set.validators.move_elements.safeParse({ elements: [{ id: 'A', dx: 10, dy: 0 }] }).success)
  assert.ok(!set.validators.move_elements.safeParse({ elements: [] }).success)
  assert.ok(set.validators.duplicate_elements.safeParse({ ids: ['A'], dy: 200 }).success)
  assert.ok(set.validators.undo.safeParse({}).success)
  assert.ok(!set.validators.undo.safeParse({ steps: 0 }).success)
  assert.ok(!set.validators.redo.safeParse({ steps: 21 }).success)
})
