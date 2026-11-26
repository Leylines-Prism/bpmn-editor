// Rapport de contrôle (src/diagram-checks.js) : compteurs et contrôles sur des documents écrits à la main.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BpmnModdle } from 'bpmn-moddle'
import { checkXml, problemCount } from '../src/diagram-checks.js'

const NS = `xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:x="http://example.com/x"`
const shape = (id, x = 100) => `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="100" width="100" height="80" /></bpmndi:BPMNShape>`
const edge = (id) => `<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}"><di:waypoint x="1" y="1" /><di:waypoint x="2" y="2" /></bpmndi:BPMNEdge>`
const doc = (semantic, di, plane = 'P') =>
  `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions ${NS} id="Defs" targetNamespace="http://example.com">${semantic}<bpmndi:BPMNDiagram id="D"><bpmndi:BPMNPlane id="PL" bpmnElement="${plane}">${di}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`

const SIMPLE = doc(
  `<bpmn:process id="P"><bpmn:startEvent id="S" name="Start" x:extra="1" /><bpmn:task id="T" name="Do" /><bpmn:endEvent id="E" name="End" /><bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T" /><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="E" /></bpmn:process>`,
  shape('S') + shape('T', 200) + shape('E', 300) + edge('F1') + edge('F2'),
)

const moddle = BpmnModdle()
const byId = (report) => Object.fromEntries(report.checks.map((c) => [c.id, c]))

test('a clean diagram passes every check that can run, and is counted', async () => {
  const report = await checkXml(SIMPLE, { moddle })
  assert.deepEqual(report.failed, [])
  assert.equal(report.total, 4) // réimport et bpmnlint ne tournent pas sans éditeur
  assert.equal(byId(report).reimport.skipped, true)
  assert.equal(report.counts.activities, 1)
  assert.equal(report.counts.events, 2)
  assert.equal(report.counts.sequenceFlows, 2)
  assert.equal(problemCount(report), 0)
})

test('malformed XML fails the first check and skips the others', async () => {
  const report = await checkXml('<bpmn:definitions><a></b>', { moddle })
  assert.deepEqual(report.failed, ['xml'])
  assert.equal(report.total, 1)
})

test('unknown BPMN elements and attributes fail the metamodel check, extensions do not', async () => {
  const xml = SIMPLE.replace('<bpmn:task id="T" name="Do" />', '<bpmn:task id="T" name="Do" colour="red" /><bpmn:taskk id="Q" />')
  const report = await checkXml(xml, { moddle })
  const metamodel = byId(report).metamodel
  assert.equal(metamodel.ok, false)
  assert.equal(metamodel.problems.length, 2)
  assert.ok(metamodel.problems.some((p) => /colour/.test(p.message)))
  assert.ok(metamodel.problems.some((p) => /Taskk/.test(p.message)))
  assert.ok(!metamodel.problems.some((p) => /x:extra/.test(p.message)))
})

test('unresolved references and duplicate ids fail the references check', async () => {
  const xml = SIMPLE.replace('targetRef="E"', 'targetRef="Nowhere"').replace('<bpmn:endEvent id="E" name="End" />', '<bpmn:endEvent id="E" name="End" /><bpmn:task id="T" />')
  const report = await checkXml(xml, { moddle })
  const refs = byId(report).references
  assert.equal(refs.ok, false)
  assert.ok(refs.problems.some((p) => /unresolved reference <Nowhere>/.test(p.message)))
  assert.ok(refs.problems.some((p) => /duplicate ID <T>/.test(p.message)))
})

test('flows that leave their scope fail the references check', async () => {
  const xml = doc(
    `<bpmn:collaboration id="C"><bpmn:participant id="A" processRef="PA" /><bpmn:participant id="B" processRef="PB" />` +
      `<bpmn:messageFlow id="M1" sourceRef="TA" targetRef="TA2" /><bpmn:messageFlow id="M2" sourceRef="TA" targetRef="TB" /></bpmn:collaboration>` +
      `<bpmn:process id="PA"><bpmn:task id="TA" /><bpmn:task id="TA2" /><bpmn:sequenceFlow id="X" sourceRef="TA" targetRef="TB" /></bpmn:process>` +
      `<bpmn:process id="PB"><bpmn:task id="TB" /></bpmn:process>`,
    ['A', 'B', 'TA', 'TA2', 'TB'].map((id) => shape(id)).join('') + ['M1', 'M2', 'X'].map(edge).join(''),
    'C',
  )
  const report = await checkXml(xml, { moddle })
  const messages = byId(report).references.problems.map((p) => p.message)
  assert.ok(messages.some((m) => /message flow M1 stays inside pool A/.test(m)))
  assert.ok(messages.some((m) => /sequence flow X connects TB/.test(m)))
  assert.ok(!messages.some((m) => /M2/.test(m)))
  assert.equal(report.counts.pools, 2)
  assert.equal(report.counts.messageFlows, 2)
  assert.equal(byId(report).di.ok, true)
})

test('elements without a shape or with a broken edge fail the DI check', async () => {
  const xml = SIMPLE.replace(shape('T', 200), '').replace(edge('F2'), '<bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="1" y="1" /></bpmndi:BPMNEdge>')
  const report = await checkXml(xml, { moddle })
  const di = byId(report).di
  assert.equal(di.ok, false)
  assert.ok(di.problems.some((p) => p.id === 'T' && /not drawn/.test(p.message)))
  assert.ok(di.problems.some((p) => p.id === 'F2' && /2 waypoints/.test(p.message)))
})

test('reimport and lint results are used when given', async () => {
  const report = await checkXml(SIMPLE, {
    moddle,
    reimport: async () => ({ warnings: [{ message: 'element <T> referenced by <F1> not yet drawn' }] }),
    lint: async () => ({
      'label-required': [{ id: 'T', category: 'error', message: 'Element is missing label/name' }],
      'no-implicit-end': [{ id: 'S', category: 'warn', message: 'warning only' }],
    }),
  })
  assert.deepEqual(report.failed, ['reimport', 'lint'])
  assert.equal(report.total, 6)
  assert.equal(report.lint.errors, 1)
  assert.equal(report.lint.warnings, 1)
  assert.equal(byId(report).lint.problems.length, 1)
  assert.equal(problemCount(report), 2)
})
