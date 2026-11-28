// Objectifs chiffrés du processus (src/goals.js) et leur place dans le rapport de processus.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { BpmnModdle } from 'bpmn-moddle'
import { goalOf, measureGoal, goalMet } from '../src/goals.js'
import { runBatch } from '../src/simulation-stats.js'

const classList = { toggle() {}, contains: () => false, add() {}, remove() {} }
globalThis.document ??= { documentElement: { classList }, body: { classList }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }
globalThis.window ??= globalThis
const { buildReport, reportToMarkdown } = await import('../src/process-report.js')

const ext = JSON.parse(fs.readFileSync(new URL('../src/bpmn-pilot-moddle.json', import.meta.url), 'utf8'))
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmnpilot="https://bpmn.leylines.fr/schema/bpmn-pilot/1.0" id="D">
  <bpmn:process id="P" name="Requests">
    <bpmn:startEvent id="S" name="Request received" />
    <bpmn:task id="A" name="Check the request" />
    <bpmn:exclusiveGateway id="G" name="Complete?" />
    <bpmn:task id="B" name="Ask for documents" bpmnpilot:goalShare="15" bpmnpilot:goalOp="max" />
    <bpmn:endEvent id="E" name="Accepted" bpmnpilot:goalShare="80" bpmnpilot:goalOp="min" />
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="A" />
    <bpmn:sequenceFlow id="F1" sourceRef="A" targetRef="G" />
    <bpmn:sequenceFlow id="F2" sourceRef="G" targetRef="E" name="Yes" bpmnpilot:probability="70" />
    <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="B" name="No" bpmnpilot:probability="30" />
    <bpmn:sequenceFlow id="F4" sourceRef="B" targetRef="A" />
  </bpmn:process>
</bpmn:definitions>`

const read = async (moddle) => (await moddle.fromXML(XML)).rootElement
const node = (d, id) => d.rootElements[0].flowElements.find((e) => e.id === id)

test('goals are read with or without the editor extension, only on ends and activities', async () => {
  for (const moddle of [new BpmnModdle({ bpmnpilot: ext }), new BpmnModdle()]) {
    const d = await read(moddle)
    assert.deepEqual(goalOf(node(d, 'E')), { share: 80, op: 'min' })
    assert.deepEqual(goalOf(node(d, 'B')), { share: 15, op: 'max' })
    assert.equal(goalOf(node(d, 'A')), null)
    assert.equal(goalOf(node(d, 'G')), null)
  }
})

test('a goal is measured on a run of tokens and compared with its bound', async () => {
  const d = await read(new BpmnModdle({ bpmnpilot: ext }))
  assert.equal(measureGoal(node(d, 'E'), null), null)
  const sim = { runs: 200, nodes: { E: 200, B: 86 } }
  assert.equal(measureGoal(node(d, 'E'), sim), 100)
  assert.equal(measureGoal(node(d, 'B'), sim), 43)
  assert.equal(goalMet({ share: 80, op: 'min' }, 100), true)
  assert.equal(goalMet({ share: 15, op: 'max' }, 43), false)
  assert.equal(goalMet({ share: 15, op: 'max' }, 15), true)
})

test('the process report lists the goals, and a missed goal becomes a warning with an improvement area', async () => {
  const definitions = await read(new BpmnModdle({ bpmnpilot: ext }))
  const modeler = { getDefinitions: () => definitions, get: (name) => (name === 'translate' ? (s) => s : null) }
  let seed = 1
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const simulation = runBatch(definitions, 500, random)

  const before = await buildReport(modeler, { lint: {} })
  assert.deepEqual(before.goals.map((g) => g.status), ['unmeasured', 'unmeasured'])
  assert.equal(before.findings.filter((f) => f.source === 'goal').length, 0)

  const after = await buildReport(modeler, { lint: {}, simulation })
  const byId = Object.fromEntries(after.goals.map((g) => [g.elementId, g]))
  assert.equal(byId.E.status, 'met') // chaque instance finit sur « Accepted »
  assert.equal(byId.B.status, 'missed') // environ 43 demandes de pièces pour 100
  const missed = after.findings.filter((f) => f.source === 'goal')
  assert.equal(missed.length, 1)
  assert.equal(missed[0].level, 'warning')
  assert.ok(after.axes.some((a) => a.source === 'goal'))

  const md = reportToMarkdown(after)
  assert.match(md, /## Process goals/)
  assert.match(md, /at most 15 passes per 100 instances/)
  assert.match(md, /\*\*Not reached\*\*/)
})
