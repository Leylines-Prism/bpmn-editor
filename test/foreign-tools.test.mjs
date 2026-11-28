// Un .bpmn de BPMN Pilot lu puis réécrit par un outil qui ne connaît pas ses extensions
// (bpmn-moddle seul, comme le font les éditeurs fondés sur bpmn-js) : rien ne se perd,
// et rien n'est signalé comme invalide.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { BpmnModdle } from 'bpmn-moddle'

const xml = fs.readFileSync(new URL('./fixtures/pilot-extensions.bpmn', import.meta.url), 'utf8')

test('a tool without the BPMN Pilot extension keeps every BPMN Pilot attribute and element', async () => {
  const moddle = new BpmnModdle()
  const { rootElement, warnings } = await moddle.fromXML(xml)
  assert.deepEqual(warnings, [])
  const { xml: out } = await moddle.toXML(rootElement, { format: true })
  for (const kept of [
    'xmlns:bpmnpilot="https://bpmn.leylines.fr/schema/bpmn-pilot/1.0"',
    'bpmnpilot:agent="true"',
    'bpmnpilot:goalShare="80"',
    'bpmnpilot:goalOp="min"',
    'bpmnpilot:probability="85"',
    'bpmnpilot:probabilitySource="copilot"',
    '<bpmnpilot:analysis author="Model"',
    '<bpmnpilot:summary>',
    'kind="risk"',
    'bioc:fill="#FFFFFF"',
    'color:background-color="#FFFFFF"',
    '<bpmn:adHocSubProcess id="Agent"',
  ]) assert.ok(out.includes(kept), kept)
})
