// Étape d'agent IA (src/lint/agent-steps.js) : marque, revue humaine, sortie, et les deux
// règles bpmnlint branchées sur la configuration de l'éditeur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BpmnModdle } from 'bpmn-moddle'
import { Linter } from 'bpmnlint'
import { isAgentStep, hasHumanReview, hasEscalationExit, AGENT_MESSAGES as M } from '../src/lint/agent-steps.js'
import lintConfig from '../src/lint/lint-config.js'

const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmnpilot="https://bpmn.leylines.fr/schema/bpmn-pilot/1.0"'
const pilot = JSON.parse(readFileSync(new URL('../src/bpmn-pilot-moddle.json', import.meta.url)))
const withExtension = new BpmnModdle({ bpmnpilot: pilot })
const plain = new BpmnModdle()
const read = async (body, moddle = withExtension) =>
  (await moddle.fromXML(`<bpmn:definitions ${NS} id="D" targetNamespace="http://example.com"><bpmn:process id="P">${body}</bpmn:process></bpmn:definitions>`)).rootElement
const step = (defs) => defs.rootElements[0].flowElements.find((e) => e.id === 'A')

const AGENT = '<bpmn:adHocSubProcess id="A" name="Qualify the request" bpmnpilot:agent="true"><bpmn:serviceTask id="T1" name="Search the CRM" /></bpmn:adHocSubProcess>'
const flows = (...pairs) => pairs.map(([s, t], i) => `<bpmn:sequenceFlow id="F${i}" sourceRef="${s}" targetRef="${t}" />`).join('')

test('the mark is read with or without the editor extension', async () => {
  assert.equal(isAgentStep(step(await read(AGENT))), true)
  assert.equal(isAgentStep(step(await read(AGENT, plain))), true)
  assert.equal(isAgentStep(step(await read('<bpmn:adHocSubProcess id="A" />'))), false)
  assert.equal(isAgentStep(step(await read('<bpmn:subProcess id="A" bpmnpilot:agent="true" />'))), false)
})

test('a review is found on every path, or inside the step', async () => {
  const reviewed = await read(`<bpmn:startEvent id="S" />${AGENT}<bpmn:userTask id="R" /><bpmn:endEvent id="E" />${flows(['S', 'A'], ['A', 'R'], ['R', 'E'])}`)
  assert.equal(hasHumanReview(step(reviewed)), true)
  const bypass = await read(`${AGENT}<bpmn:exclusiveGateway id="G" /><bpmn:userTask id="R" /><bpmn:endEvent id="E1" /><bpmn:endEvent id="E2" />${flows(['A', 'G'], ['G', 'R'], ['R', 'E1'], ['G', 'E2'])}`)
  assert.equal(hasHumanReview(step(bypass)), false)
  const inside = await read(`<bpmn:adHocSubProcess id="A" bpmnpilot:agent="true"><bpmn:userTask id="Ask" /></bpmn:adHocSubProcess><bpmn:endEvent id="E" />${flows(['A', 'E'])}`)
  assert.equal(hasHumanReview(step(inside)), true)
  const loop = await read(`${AGENT}<bpmn:task id="T" /><bpmn:exclusiveGateway id="G" /><bpmn:manualTask id="R" />${flows(['A', 'T'], ['T', 'G'], ['G', 'T'], ['G', 'R'])}`)
  assert.equal(hasHumanReview(step(loop)), true)
  assert.equal(hasHumanReview(step(await read(AGENT))), false)
})

test('any boundary event but compensation is an exit', async () => {
  assert.equal(hasEscalationExit(step(await read(`${AGENT}<bpmn:boundaryEvent id="B" attachedToRef="A"><bpmn:timerEventDefinition /></bpmn:boundaryEvent>`))), true)
  assert.equal(hasEscalationExit(step(await read(`${AGENT}<bpmn:boundaryEvent id="B" attachedToRef="A"><bpmn:compensateEventDefinition /></bpmn:boundaryEvent>`))), false)
  assert.equal(hasEscalationExit(step(await read(AGENT))), false)
})

test('the editor lint configuration warns on a bare agent step only', async () => {
  const bare = await read(`<bpmn:startEvent id="S" name="Start" />${AGENT}<bpmn:endEvent id="E" name="Done" />${flows(['S', 'A'], ['A', 'E'])}`)
  const results = await new Linter(lintConfig).lint(bare)
  assert.deepEqual(results['bpmnpilot/agent-review'].map((r) => [r.id, r.message, r.category]), [['A', M.review, 'warn']])
  assert.deepEqual(results['bpmnpilot/agent-escalation'].map((r) => [r.id, r.message, r.category]), [['A', M.escalation, 'warn']])

  const full = await read(`<bpmn:startEvent id="S" name="Start" />${AGENT}<bpmn:userTask id="R" name="Review" /><bpmn:endEvent id="E" name="Done" />` +
    '<bpmn:boundaryEvent id="B" name="Too late" attachedToRef="A"><bpmn:timerEventDefinition /></bpmn:boundaryEvent><bpmn:userTask id="M" name="Handle manually" /><bpmn:endEvent id="E2" name="Handled" />' +
    flows(['S', 'A'], ['A', 'R'], ['R', 'E'], ['B', 'M'], ['M', 'E2']))
  const ok = await new Linter(lintConfig).lint(full)
  assert.equal(ok['bpmnpilot/agent-review'], undefined)
  assert.equal(ok['bpmnpilot/agent-escalation'], undefined)
})
