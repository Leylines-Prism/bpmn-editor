// Prompts MCP (src/ai/prompts.js) : noms, arguments et texte produit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { buildPrompts } from '../src/ai/prompts.js'

const prompts = buildPrompts(z)
const byName = Object.fromEntries(prompts.map((p) => [p.name, p]))

test('the four prompts are there, with unique names', () => {
  assert.deepEqual(Object.keys(byName).sort(), ['model_collaboration', 'model_process', 'review_diagram', 'tidy_diagram'])
  for (const p of prompts) assert.ok(p.title && p.description, p.name)
})

test('model_process requires a description and puts it in the text', () => {
  const args = z.object(byName.model_process.argsSchema)
  assert.equal(args.safeParse({}).success, false)
  assert.equal(args.safeParse({ description: '' }).success, false)
  const text = byName.model_process.text({ description: 'Approve a holiday request' })
  assert.match(text, /Approve a holiday request/)
  assert.match(text, /validate_diagram/)
})

test('model_collaboration lists the participants only when given', () => {
  const p = byName.model_collaboration
  assert.equal(z.object(p.argsSchema).safeParse({ description: 'Order' }).success, true)
  assert.doesNotMatch(p.text({ description: 'Order' }), /Participants:/)
  assert.match(p.text({ description: 'Order', participants: 'Customer, Shop' }), /Participants: Customer, Shop/)
})

test('review_diagram asks not to change anything', () => {
  assert.match(byName.review_diagram.text(), /Do not change anything/)
})
