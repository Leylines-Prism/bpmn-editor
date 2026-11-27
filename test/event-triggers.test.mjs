// Déclencheurs admis par la norme pour chaque sorte d'événement (src/lint/event-triggers.js),
// et la règle bpmnlint maison branchée sur la configuration de l'éditeur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BpmnModdle } from 'bpmn-moddle'
import { Linter } from 'bpmnlint'
import { eventTriggerProblem, EVENT_TRIGGER_MESSAGES as M } from '../src/lint/event-triggers.js'
import lintConfig from '../src/lint/lint-config.js'

const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"'
const moddle = new BpmnModdle()
const read = async (body) => (await moddle.fromXML(`<bpmn:definitions ${NS} id="D" targetNamespace="http://example.com"><bpmn:process id="P">${body}</bpmn:process></bpmn:definitions>`)).rootElement
const find = (defs, id) => {
  const all = []
  const walk = (o) => { for (const el of o.flowElements || []) { all.push(el); walk(el) } }
  walk(defs.rootElements[0])
  return all.find((e) => e.id === id)
}
const problem = async (body, id = 'E') => eventTriggerProblem(find(await read(body), id))

test('allowed combinations raise nothing', async () => {
  assert.equal(await problem('<bpmn:startEvent id="E"><bpmn:timerEventDefinition /></bpmn:startEvent>'), null)
  assert.equal(await problem('<bpmn:endEvent id="E"><bpmn:terminateEventDefinition /></bpmn:endEvent>'), null)
  assert.equal(await problem('<bpmn:intermediateThrowEvent id="E" />'), null)
  assert.equal(await problem('<bpmn:intermediateCatchEvent id="E"><bpmn:linkEventDefinition name="A" /></bpmn:intermediateCatchEvent>'), null)
  assert.equal(await problem('<bpmn:task id="T" /><bpmn:boundaryEvent id="E" attachedToRef="T" cancelActivity="false"><bpmn:escalationEventDefinition /></bpmn:boundaryEvent>'), null)
  assert.equal(await problem('<bpmn:subProcess id="S" triggeredByEvent="true"><bpmn:startEvent id="E"><bpmn:errorEventDefinition /></bpmn:startEvent></bpmn:subProcess>'), null)
  assert.equal(await problem('<bpmn:transaction id="S"><bpmn:endEvent id="E"><bpmn:cancelEventDefinition /></bpmn:endEvent></bpmn:transaction>'), null)
})

test('combinations the standard does not allow are reported', async () => {
  assert.equal(await problem('<bpmn:endEvent id="E"><bpmn:timerEventDefinition /></bpmn:endEvent>'), M.end)
  assert.equal(await problem('<bpmn:startEvent id="E"><bpmn:errorEventDefinition /></bpmn:startEvent>'), M.start)
  assert.equal(await problem('<bpmn:intermediateThrowEvent id="E"><bpmn:timerEventDefinition /></bpmn:intermediateThrowEvent>'), M.throw)
  assert.equal(await problem('<bpmn:intermediateCatchEvent id="E"><bpmn:errorEventDefinition /></bpmn:intermediateCatchEvent>'), M.catch)
  assert.equal(await problem('<bpmn:task id="T" /><bpmn:boundaryEvent id="E" attachedToRef="T" cancelActivity="false"><bpmn:errorEventDefinition /></bpmn:boundaryEvent>'), M.nonInterrupting)
  assert.equal(await problem('<bpmn:task id="T" /><bpmn:boundaryEvent id="E" attachedToRef="T" />'), M.boundaryNone)
  assert.equal(await problem('<bpmn:task id="T" /><bpmn:boundaryEvent id="E" attachedToRef="T"><bpmn:cancelEventDefinition /></bpmn:boundaryEvent>'), M.cancel)
  assert.equal(await problem('<bpmn:endEvent id="E"><bpmn:cancelEventDefinition /></bpmn:endEvent>'), M.cancel)
  assert.equal(await problem('<bpmn:subProcess id="S" triggeredByEvent="true"><bpmn:startEvent id="E" isInterrupting="false"><bpmn:compensateEventDefinition /></bpmn:startEvent></bpmn:subProcess>'), M.nonInterrupting)
})

test('cases other rules already cover are left to them', async () => {
  assert.equal(await problem('<bpmn:subProcess id="S"><bpmn:startEvent id="E"><bpmn:messageEventDefinition /></bpmn:startEvent></bpmn:subProcess>'), null)
  assert.equal(await problem('<bpmn:endEvent id="E"><bpmn:messageEventDefinition /><bpmn:signalEventDefinition /></bpmn:endEvent>'), null)
})

test('the editor lint configuration runs the rule, and the complex gateway is only a warning', async () => {
  const defs = await read('<bpmn:startEvent id="S" name="Start" /><bpmn:endEvent id="E" name="Late"><bpmn:timerEventDefinition /></bpmn:endEvent><bpmn:sequenceFlow id="F" sourceRef="S" targetRef="E" />')
  const results = await new Linter(lintConfig).lint(defs)
  assert.deepEqual(results['bpmnpilot/event-triggers'].map((r) => [r.id, r.message, r.category]), [['E', M.end, 'error']])
  assert.equal(lintConfig.config.rules['no-complex-gateway'], 'warn')
})
