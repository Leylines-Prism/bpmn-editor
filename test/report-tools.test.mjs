// Outils get_process_report et update_elements (documentation, probabilité) : arguments
// acceptés ou refusés avant d'atteindre l'éditeur, pour le chat intégré comme pour le MCP.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { createToolSet, runTool } from '../src/ai/chat-loop.js'

const toolSet = createToolSet(z)
const quiet = { emit: () => {}, log: () => {} }
const run = (name, input) => {
  let ran = null
  return runTool({ toolSet, name, input, executeTool: async (n, args) => { ran = args; return { ok: true } }, ...quiet }).then((result) => ({ result, ran }))
}

test('get_process_report is offered in both API formats', () => {
  assert.ok(toolSet.anthropic.some((t) => t.name === 'get_process_report'))
  assert.ok(toolSet.openai.some((t) => t.function.name === 'get_process_report'))
})

test('get_process_report takes an optional simulate flag', async () => {
  assert.equal((await run('get_process_report', {})).result.isError, false)
  assert.equal((await run('get_process_report', { simulate: true })).result.isError, false)
  assert.equal((await run('get_process_report', { simulate: 'yes' })).result.isError, true)
})

test('update_elements accepts documentation and a probability between 0 and 100, or null', async () => {
  const ok = await run('update_elements', { elements: [{ id: 'Task_1', documentation: 'Check the file.' }, { id: 'Flow_1', probability: 40 }, { id: 'Flow_2', probability: null }] })
  assert.equal(ok.result.isError, false)
  assert.equal(ok.ran.elements[1].probability, 40)
  assert.equal(ok.ran.elements[2].probability, null)
  for (const probability of [-1, 101, '40']) {
    const bad = await run('update_elements', { elements: [{ id: 'Flow_1', probability }] })
    assert.equal(bad.result.isError, true, String(probability))
    assert.equal(bad.ran, null)
  }
  const long = await run('update_elements', { elements: [{ id: 'Task_1', documentation: 'x'.repeat(4001) }] })
  assert.equal(long.result.isError, true)
})

test('update_elements accepts user stories and acceptance criteria as text, up to 2000 characters', async () => {
  const ok = await run('update_elements', { elements: [{ id: 'Task_1', userStories: 'As a clerk, I want the file, so that I can check it.', acceptanceCriteria: 'Given a file, when it is complete, then it is accepted.' }] })
  assert.equal(ok.result.isError, false)
  assert.equal(ok.ran.elements[0].userStories, 'As a clerk, I want the file, so that I can check it.')
  assert.equal((await run('update_elements', { elements: [{ id: 'Task_1', userStories: ['a'] }] })).result.isError, true)
  assert.equal((await run('update_elements', { elements: [{ id: 'Task_1', acceptanceCriteria: 'x'.repeat(2001) }] })).result.isError, true)
})
