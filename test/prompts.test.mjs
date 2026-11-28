// Prompts MCP (src/ai/prompts.js) : noms, arguments et texte produit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { buildPrompts } from '../src/ai/prompts.js'

const prompts = buildPrompts(z)
const byName = Object.fromEntries(prompts.map((p) => [p.name, p]))

test('the seven prompts are there, with unique names', () => {
  assert.deepEqual(Object.keys(byName).sort(), ['add_agent_step', 'critique_description', 'model_collaboration', 'model_process', 'review_diagram', 'tidy_diagram', 'write_user_stories'])
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

test('critique_description requires a description and asks before drawing', () => {
  const p = byName.critique_description
  assert.equal(z.object(p.argsSchema).safeParse({}).success, false)
  const text = p.text({ description: 'Handle a refund' })
  assert.match(text, /Handle a refund/)
  assert.match(text, /Do not draw anything yet/)
  assert.match(text, /blocking/)
})

test('add_agent_step asks for the agent mark, a review and an exit', () => {
  const p = byName.add_agent_step
  assert.equal(z.object(p.argsSchema).safeParse({}).success, false)
  const text = p.text({ goal: 'Qualify the request', tools: 'CRM search, Credit score' })
  assert.match(text, /Qualify the request/)
  assert.match(text, /Tools: CRM search, Credit score/)
  assert.match(text, /agent: true/)
  assert.match(text, /UserTask/)
  assert.match(text, /boundary event/)
  assert.doesNotMatch(p.text({ goal: 'X' }), /Tools:/)
})
