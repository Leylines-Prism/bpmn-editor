// Analyse du Co-pilote IA (src/copilot-analysis.js) : enregistrement dans le .bpmn,
// relecture, empreinte de la structure, et schéma de l'outil set_report_commentary.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as z from 'zod'
import { BpmnModdle } from 'bpmn-moddle'
import { readAnalysis, analysisUpdates, structureFingerprint, isAiProbability } from '../src/copilot-analysis.js'
import { createToolSet, runTool } from '../src/ai/chat-loop.js'

const ext = JSON.parse(fs.readFileSync(new URL('../src/bpmn-pilot-moddle.json', import.meta.url), 'utf8'))
const moddle = new BpmnModdle({ bpmnpilot: ext })
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmnpilot="https://bpmn.leylines.fr/schema/bpmn-pilot/1.0" id="D">
  <bpmn:process id="P">
    <bpmn:extensionElements><other:x xmlns:other="urn:other" /></bpmn:extensionElements>
    <bpmn:startEvent id="S" />
    <bpmn:exclusiveGateway id="G" name="OK?" />
    <bpmn:task id="A" name="Do A" />
    <bpmn:endEvent id="E" />
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="G" />
    <bpmn:sequenceFlow id="F1" sourceRef="G" targetRef="A" bpmnpilot:probability="70" bpmnpilot:probabilitySource="copilot" />
    <bpmn:sequenceFlow id="F2" sourceRef="G" targetRef="E" bpmnpilot:probability="30" />
    <bpmn:sequenceFlow id="F3" sourceRef="A" targetRef="E" />
  </bpmn:process>
</bpmn:definitions>`

const load = async (xml) => (await moddle.fromXML(xml)).rootElement
const flow = (d, id) => d.rootElements[0].flowElements.find((e) => e.id === id)

test('an AI probability is told apart from a reviewed one', async () => {
  const d = await load(XML)
  assert.equal(isAiProbability(flow(d, 'F1')), true)
  assert.equal(isAiProbability(flow(d, 'F2')), false)
})

test('the analysis is saved in the process, read back, and keeps other extensions', async () => {
  const d = await load(XML)
  const process = d.rootElements[0]
  const data = { author: 'Model X', date: '2026-11-26T23:00:00.000Z', fingerprint: structureFingerprint(d), summary: 'Short & <clear>.', points: [{ kind: 'bottleneck', elements: ['A', 'G'], text: '70 % go through A.' }] }
  for (const u of analysisUpdates(moddle, d, process, data)) u.bo.extensionElements = u.extensionElements
  const { xml } = await moddle.toXML(d)
  const { rootElement: again, warnings } = await moddle.fromXML(xml)
  assert.deepEqual(warnings, [])
  assert.equal(again.rootElements[0].extensionElements.values.length, 2)
  const read = readAnalysis(again)
  assert.equal(read.author, 'Model X')
  assert.equal(read.summary, 'Short & <clear>.')
  assert.deepEqual(read.points, [{ kind: 'bottleneck', elements: ['A', 'G'], text: '70 % go through A.' }])
  assert.equal(read.fingerprint, structureFingerprint(again))

  // Retrait : l'autre extension reste.
  for (const u of analysisUpdates(moddle, again, again.rootElements[0], null)) u.bo.extensionElements = u.extensionElements
  assert.equal(readAnalysis(again), null)
  assert.equal(again.rootElements[0].extensionElements.values.length, 1)
})

test('the fingerprint follows the structure, not the positions', async () => {
  const d = await load(XML)
  const before = structureFingerprint(d)
  assert.equal(structureFingerprint(await load(XML)), before)
  d.rootElements[0].flowElements.find((e) => e.id === 'A').name = 'Do B'
  assert.notEqual(structureFingerprint(d), before)
})

const toolSet = createToolSet(z)
const run = (input) => runTool({ toolSet, name: 'set_report_commentary', input, executeTool: async () => ({ ok: true }), emit: () => {}, log: () => {} })

test('set_report_commentary checks its arguments before reaching the editor', async () => {
  assert.ok(toolSet.anthropic.some((t) => t.name === 'set_report_commentary'))
  assert.equal((await run({ summary: 'Fine.', points: [{ kind: 'risk', elements: ['A'], text: 'No timeout.' }] })).isError, false)
  assert.equal((await run({ summary: '', points: [] })).isError, false)
  assert.equal((await run({ summary: 'x', points: [{ kind: 'other', text: 'y' }] })).isError, true)
  assert.equal((await run({ summary: 'x'.repeat(2001), points: [] })).isError, true)
  assert.equal((await run({ summary: 'x', points: Array.from({ length: 13 }, () => ({ kind: 'risk', text: 'y' })) })).isError, true)
})
