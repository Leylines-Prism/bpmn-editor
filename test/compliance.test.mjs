// Risques, contrôles et exigences par activité, fiche d'identité du processus (mode Expert) :
// lecture (src/compliance.js), rapport de processus, fiches de procédure, import de tableau.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BpmnModdle } from 'bpmn-moddle'
import pilot from '../src/bpmn-pilot-moddle.json' with { type: 'json' }

// Le rapport passe par des modules de l'éditeur qui touchent la page au chargement.
const classList = { toggle() {}, contains: () => false, add() {}, remove() {} }
globalThis.document ??= { documentElement: { classList }, body: { classList }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }
globalThis.window ??= globalThis
const { buildReport, reportToMarkdown } = await import('../src/process-report.js')
const { sheetsToMarkdown } = await import('../src/doc/procedure-sheets.js')
const { splitLines, splitRefs, identityOf, buildCompliance } = await import('../src/compliance.js')
const { readTable, tableToXml } = await import('../src/table-import.js')

const moddle = () => new BpmnModdle({ bpmnpilot: pilot })

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmnpilot="https://bpmn.leylines.fr/schema/bpmn-pilot/1.0" id="D" targetNamespace="x">
  <bpmn:process id="P" name="Expense claims" bpmnpilot:owner="Finance director" bpmnpilot:version="2.1" bpmnpilot:status="approved" bpmnpilot:validatedOn="2026-11-27" bpmnpilot:scope="All employees, from the claim to the payment.">
    <bpmn:startEvent id="S" />
    <bpmn:task id="A" name="Check the claim" bpmnpilot:risks="Fake receipt&#10;Personal data in the receipts" bpmnpilot:controls="Sample audit" bpmnpilot:requirements="GDPR art. 30 ; ISO 9001 §8.5" />
    <bpmn:task id="B" name="Pay the claim" bpmnpilot:risks="Wrong bank account" bpmnpilot:requirements="gdpr art. 30;AI Act art. 14, §1" />
    <bpmn:endEvent id="E" />
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="A" />
    <bpmn:sequenceFlow id="F1" sourceRef="A" targetRef="B" />
    <bpmn:sequenceFlow id="F2" sourceRef="B" targetRef="E" />
  </bpmn:process>
</bpmn:definitions>`

async function report(xml = XML) {
  const { rootElement: definitions } = await moddle().fromXML(xml)
  const modeler = { getDefinitions: () => definitions, get: (name) => (name === 'translate' ? (s) => s : null) }
  return buildReport(modeler, { name: 'claims', lint: {} })
}

test('risks and controls are one per line, requirements split on semicolons only', () => {
  assert.deepEqual(splitLines(' Fake receipt \n\n Late payment\r\n'), ['Fake receipt', 'Late payment'])
  assert.deepEqual(splitRefs('GDPR art. 30 ; AI Act art. 5, §1\nISO 27001'), ['GDPR art. 30', 'AI Act art. 5, §1', 'ISO 27001'])
  assert.equal(buildCompliance([{ activity: true, risks: [], controls: [], requirements: [] }]), null)
})

test('the report lists risks and controls, flags a risk without control and builds the compliance matrix', async () => {
  const r = await report()
  assert.deepEqual(r.compliance.risks.map((x) => [x.name, x.risks, x.controls]), [
    ['Check the claim', ['Fake receipt', 'Personal data in the receipts'], ['Sample audit']],
    ['Pay the claim', ['Wrong bank account'], []],
  ])
  // Même exigence écrite deux fois avec une casse différente : une seule ligne.
  assert.deepEqual(r.compliance.requirements.map((q) => [q.ref, q.activities]), [
    ['AI Act art. 14, §1', ['3. Pay the claim']],
    ['GDPR art. 30', ['2. Check the claim', '3. Pay the claim']],
    ['ISO 9001 §8.5', ['2. Check the claim']],
  ])
  const flag = r.findings.filter((f) => f.title === 'Risk without control')
  assert.deepEqual(flag.map((f) => f.element), ['3. Pay the claim'])
  assert.ok(r.axes.some((a) => a.title === 'Give each risk a control'))
  const md = reportToMarkdown(r)
  assert.match(md, /- \*\*Process owner\*\*: Finance director/)
  assert.match(md, /- \*\*Status\*\*: Approved/)
  assert.match(md, /## Risks and controls[\s\S]*\| 3 \| Pay the claim \| Wrong bank account \| \*none\* \|/)
  assert.match(md, /## Compliance matrix[\s\S]*\| GDPR art\. 30 \| 2\. Check the claim · 3\. Pay the claim \|/)
})

test('a report without these fields shows none of the new sections', async () => {
  const bare = XML.replace(/ bpmnpilot:\w+="[^"]*"/g, '')
  const r = await report(bare)
  assert.equal(r.compliance, null)
  assert.equal(r.identity, null)
  const md = reportToMarkdown(r)
  assert.doesNotMatch(md, /Risks and controls|Compliance matrix|Process owner/)
})

test('the process identity heads the procedure sheets, and each sheet shows its risks, controls and requirements', async () => {
  const md = sheetsToMarkdown(await report())
  assert.match(md, /- \*\*Version\*\*: 2\.1/)
  assert.match(md, /- \*\*Scope\*\*: All employees, from the claim to the payment\./)
  assert.match(md, /\*\*Risks\*\*: Fake receipt ; Personal data in the receipts/)
  assert.match(md, /\*\*Controls\*\*: Sample audit/)
  assert.match(md, /\*\*Requirements\*\*: gdpr art\. 30 ; AI Act art\. 14, §1/)
})

test('the identity is read on the collaboration first, and an unknown status is ignored', async () => {
  const collab = { get: (k) => ({ 'bpmnpilot:owner': 'COO', 'bpmnpilot:status': 'bogus' })[k] }
  const proc = { get: (k) => ({ 'bpmnpilot:owner': 'Team lead' })[k] }
  assert.deepEqual(identityOf([collab, proc]), { owner: 'COO', version: '', status: '', validatedOn: '', scope: '' })
  assert.equal(identityOf([{ get: () => '' }]), null)
})

test('line breaks in risks survive a save and reload of the .bpmn file', async () => {
  const m = moddle()
  const { rootElement } = await m.fromXML(XML)
  const { xml } = await m.toXML(rootElement)
  const { rootElement: again } = await moddle().fromXML(xml)
  const task = again.rootElements[0].flowElements.find((e) => e.id === 'A')
  assert.equal(task.get('bpmnpilot:risks'), 'Fake receipt\nPersonal data in the receipts')
})

test('Risks, Controls and Requirements columns of a table land on the tasks', async () => {
  const table = readTable([['Description', 'Risques', 'Contrôles', 'Exigences'], ['Payer', 'Mauvais RIB; Doublon', 'Double validation', 'RGPD art. 30\nISO 9001']])
  const { rootElement, warnings } = await moddle().fromXML(tableToXml(table))
  assert.deepEqual(warnings, [])
  const task = rootElement.rootElements.find((e) => e.$type === 'bpmn:Process').flowElements.find((e) => e.name === 'Payer')
  assert.equal(task.get('bpmnpilot:risks'), 'Mauvais RIB\nDoublon')
  assert.equal(task.get('bpmnpilot:controls'), 'Double validation')
  assert.equal(task.get('bpmnpilot:requirements'), 'RGPD art. 30 ; ISO 9001')
})
