// Critique de la demande, rapport de contrôle et autocorrection (src/ai/assist.js), dans la boucle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { createToolSet, rewindTurn, runOpenAITurn } from '../src/ai/chat-loop.js'
import { CRITIQUE_SYSTEM, parseCritique, wantsCritique } from '../src/ai/assist.js'

const toolSet = createToolSet(z)
const LONG = 'A customer orders online, the shop checks the stock, then ships the parcel or cancels the order. '.repeat(3)

function fakeClient(steps) {
  const requests = []
  return {
    requests,
    async stream(body) {
      requests.push(structuredClone(body))
      const step = steps.shift()
      if (!step) throw new Error('no more steps')
      return { content: step.content || '', toolCalls: step.toolCalls || [], finishReason: step.toolCalls ? 'tool_calls' : 'stop' }
    },
  }
}
const draw = { toolCalls: [{ id: 'c1', name: 'add_shapes', arguments: '{"shapes":[{"type":"Task","name":"Ship"}]}' }] }
const fail = (n) => ({ errors: n, checks: [{ check: 'xml', ok: true }, { check: 'lint', ok: n === 0, problems: Array.from({ length: n }, (_, i) => ({ id: `T${i}`, message: 'missing label' })) }] })

// Éditeur factice : chaque validate_diagram rend le rapport suivant de la liste.
function fakeEditor(reports) {
  const calls = []
  return {
    calls,
    executeTool: async (name, args) => {
      calls.push(name === 'set_diagram_xml' ? `${name}:${args.xml}` : name)
      if (name === 'validate_diagram') return reports.shift()
      if (name === 'get_diagram_xml') return '<xml snapshot/>'
      return { ok: true }
    },
  }
}

test('short instructions are not reviewed, descriptions and attachments are', () => {
  assert.equal(wantsCritique('Make the task red'), false)
  assert.equal(wantsCritique(LONG), true)
  assert.equal(wantsCritique('See file', [{ kind: 'pdf' }]), true)
})

test('the critique reply is read even with text around the JSON, and cleaned', () => {
  const issues = parseCritique('Here: {"issues":[{"severity":"blocking","quote":"ships","question":"Who ships?"},{"severity":"weird","question":"Q2"},{"quote":"no question"}]} done')
  assert.deepEqual(issues, [
    { severity: 'blocking', quote: 'ships', question: 'Who ships?' },
    { severity: 'minor', quote: '', question: 'Q2' },
  ])
  assert.equal(parseCritique('no json'), null)
  assert.equal(parseCritique('{"other":1}'), null)
})

test('with the critique on, a first call without tools reviews the request, then the drawing gets the points', async () => {
  const events = []
  const client = fakeClient([{ content: '{"issues":[{"severity":"major","quote":"ships","question":"Who ships the parcel?"}]}' }, { content: 'Drawn.' }])
  const conv = { messages: [] }
  const editor = fakeEditor([])
  await runOpenAITurn({ client, model: 'm', conv, text: LONG, toolSet, executeTool: editor.executeTool, emit: (e) => events.push(e), log: () => {}, assist: { critique: true, autocorrect: true } })
  assert.equal(client.requests[0].tools, undefined)
  assert.equal(client.requests[0].messages[0].content, CRITIQUE_SYSTEM)
  const critique = events.find((e) => e.type === 'critique')
  assert.equal(critique.issues[0].question, 'Who ships the parcel?')
  const sent = client.requests[1].messages.at(-1).content
  assert.match(sent, /Who ships the parcel\?/)
  assert.match(sent, /assumptions/)
  // Rien n'a été dessiné : pas de contrôle.
  assert.deepEqual(editor.calls, [])
})

test('with the critique off, no extra call is made', async () => {
  const client = fakeClient([{ content: 'Drawn.' }])
  await runOpenAITurn({ client, model: 'm', conv: { messages: [] }, text: LONG, toolSet, executeTool: async () => ({}), emit: () => {}, log: () => {}, assist: { critique: false } })
  assert.equal(client.requests.length, 1)
  assert.ok(client.requests[0].tools)
})

test('after a drawing, the report is sent; with autocorrect off, no correction round', async () => {
  const events = []
  const client = fakeClient([draw, { content: 'Done.' }])
  const editor = fakeEditor([fail(2)])
  await runOpenAITurn({ client, model: 'm', conv: { messages: [] }, text: 'draw', toolSet, executeTool: editor.executeTool, emit: (e) => events.push(e), log: () => {}, assist: {} })
  const report = events.find((e) => e.type === 'report')
  assert.equal(report.report.errors, 2)
  assert.deepEqual(report.corrections, { asked: 0, kept: 0 })
  assert.equal(client.requests.length, 2)
})

test('a failing check goes back to the model, and a correction that helps is kept', async () => {
  const events = []
  const client = fakeClient([draw, { content: 'Done.' }, draw, { content: 'Fixed the labels.' }])
  const editor = fakeEditor([fail(2), fail(0)])
  const conv = { messages: [] }
  await runOpenAITurn({ client, model: 'm', conv, text: 'draw', toolSet, executeTool: editor.executeTool, emit: (e) => events.push(e), log: () => {}, assist: { autocorrect: true } })
  const correction = client.requests[2].messages.at(-1)
  assert.equal(correction.role, 'user')
  assert.match(correction.content, /2 problem\(s\) to fix/)
  assert.match(correction.content, /T0: missing label/)
  const report = events.find((e) => e.type === 'report')
  assert.deepEqual(report.corrections, { asked: 1, kept: 1 })
  assert.equal(report.report.errors, 0)
  assert.ok(!editor.calls.some((c) => c.startsWith('set_diagram_xml')))
})

test('a correction that does not help is undone, reported as not kept, and noted for the next message', async () => {
  const events = []
  const client = fakeClient([draw, { content: 'Done.' }, draw, { content: 'Tried.' }, { content: 'next' }])
  const editor = fakeEditor([fail(1), fail(3)])
  const conv = { messages: [] }
  await runOpenAITurn({ client, model: 'm', conv, text: 'draw', toolSet, executeTool: editor.executeTool, emit: (e) => events.push(e), log: () => {}, assist: { autocorrect: true } })
  assert.ok(editor.calls.includes('set_diagram_xml:<xml snapshot/>'))
  const report = events.find((e) => e.type === 'report')
  assert.deepEqual(report.corrections, { asked: 1, kept: 0 })
  assert.equal(report.report.errors, 1) // le rapport d'avant la correction annulée
  await runOpenAITurn({ client, model: 'm', conv, text: 'hello', toolSet, executeTool: editor.executeTool, emit: () => {}, log: () => {} })
  assert.match(client.requests.at(-1).messages.at(-1).content, /was undone[\s\S]*hello/)
})

test('two correction rounds at most', async () => {
  const events = []
  const client = fakeClient([draw, { content: 'a' }, draw, { content: 'b' }, draw, { content: 'c' }])
  const editor = fakeEditor([fail(3), fail(2), fail(1)])
  await runOpenAITurn({ client, model: 'm', conv: { messages: [] }, text: 'draw', toolSet, executeTool: editor.executeTool, emit: (e) => events.push(e), log: () => {}, assist: { autocorrect: true } })
  assert.deepEqual(events.find((e) => e.type === 'report').corrections, { asked: 2, kept: 2 })
  assert.equal(client.requests.length, 6)
})

test('rewindTurn brings the history back to before the last message', async () => {
  const client = fakeClient([{ content: 'one' }, { content: 'two' }])
  const conv = { messages: [] }
  await runOpenAITurn({ client, model: 'm', conv, text: 'first', toolSet, executeTool: async () => ({}), emit: () => {}, log: () => {} })
  const afterFirst = conv.messages
  await runOpenAITurn({ client, model: 'm', conv, text: 'second', toolSet, executeTool: async () => ({}), emit: () => {}, log: () => {} })
  assert.equal(rewindTurn(conv), true)
  assert.deepEqual(conv.messages, afterFirst)
  assert.equal(rewindTurn(conv), false)
})
