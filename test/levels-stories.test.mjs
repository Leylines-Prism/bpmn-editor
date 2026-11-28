// Carte à plusieurs niveaux (src/level-links.js), récits utilisateur (src/user-stories.js) et
// page de documentation HTML (src/doc/doc-page.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { BpmnModdle } from 'bpmn-moddle'

const classList = { toggle() {}, contains: () => false, add() {}, remove() {} }
globalThis.document ??= { documentElement: { classList }, body: { classList }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }
globalThis.window ??= globalThis
const { firstProcessId, linkOf, resolveLink, subLevelXml } = await import('../src/level-links.js')
const { buildReport, reportToMarkdown } = await import('../src/process-report.js')
const { activitiesWithStories, storiesToMarkdown } = await import('../src/user-stories.js')
const { cleanSvg, docPageHtml } = await import('../src/doc/doc-page.js')
const { sheetsToMarkdown } = await import('../src/doc/procedure-sheets.js')

const ext = JSON.parse(fs.readFileSync(new URL('../src/bpmn-pilot-moddle.json', import.meta.url), 'utf8'))
const moddle = new BpmnModdle({ bpmnpilot: ext })

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmnpilot="https://bpmn.leylines.fr/schema/bpmn-pilot/1.0" id="D">
  <bpmn:process id="P" name="Onboarding">
    <bpmn:startEvent id="S" name="Order signed" />
    <bpmn:userTask id="A" name="Survey the site &lt;b&gt;" bpmnpilot:userStories="As a field engineer, I want the site plan, so that I bring the right cables.&#10;As a project manager, I want the survey date, so that I plan the install."
      bpmnpilot:acceptanceCriteria="Given a booked survey, when the engineer arrives, then the plan is on the tablet." />
    <bpmn:callActivity id="C" name="Install the branch" calledElement="Install" bpmnpilot:linkedDiagram="browser:abc" bpmnpilot:linkedDiagramName="Branch install" />
    <bpmn:endEvent id="E" name="Live" />
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="A" />
    <bpmn:sequenceFlow id="F1" sourceRef="A" targetRef="C" />
    <bpmn:sequenceFlow id="F2" sourceRef="C" targetRef="E" />
  </bpmn:process>
</bpmn:definitions>`

async function load() {
  const { rootElement: definitions, warnings } = await moddle.fromXML(XML)
  assert.deepEqual(warnings.map((w) => w.message), [])
  const modeler = { getDefinitions: () => definitions, get: (name) => (name === 'translate' ? (s) => s : null) }
  return { definitions, report: await buildReport(modeler, { name: 'onboarding', lint: {} }) }
}

test('a call activity link is found by its key, else by a unique name', async () => {
  const { definitions } = await load()
  const call = definitions.rootElements[0].flowElements.find((el) => el.id === 'C')
  const link = linkOf(call)
  assert.deepEqual(link, { key: 'browser:abc', name: 'Branch install' })
  const rows = [{ key: 'browser:abc', name: 'Old name' }, { key: 'server:1', name: 'Branch install' }]
  assert.equal(resolveLink(link, rows).key, 'browser:abc')
  assert.equal(resolveLink(link, rows.slice(1)).key, 'server:1')
  assert.equal(resolveLink(link, [...rows.slice(1), { key: 'browser:z', name: 'Branch install' }]), null)
  assert.equal(resolveLink({ key: '', name: '' }, rows), null)
})

test('a new sub-level is a valid diagram whose process id feeds calledElement', async () => {
  const xml = subLevelXml('Install "the" <branch>', 'Process_x1')
  assert.equal(firstProcessId(xml), 'Process_x1')
  assert.equal(firstProcessId('<definitions><process id="Other"/></definitions>'), 'Other')
  assert.equal(firstProcessId(''), '')
  const { rootElement, warnings } = await moddle.fromXML(xml)
  assert.deepEqual(warnings, [])
  const process = rootElement.rootElements[0]
  assert.equal(process.name, 'Install "the" <branch>')
  assert.deepEqual(process.flowElements.map((el) => el.$type).sort(), ['bpmn:EndEvent', 'bpmn:SequenceFlow', 'bpmn:StartEvent'])
})

test('user stories and criteria reach the report, the sheets and their own Markdown', async () => {
  const { report } = await load()
  const a = report.sequence.find((s) => s.id === 'A')
  assert.equal(a.userStories.length, 2)
  assert.equal(a.acceptanceCriteria.length, 1)
  assert.equal(report.sequence.find((s) => s.id === 'C').linkedDiagram, 'Branch install')
  assert.deepEqual(activitiesWithStories(report).map((s) => s.id), ['A'])
  const md = storiesToMarkdown(report)
  assert.match(md, /^# User stories: Onboarding/)
  assert.match(md, /2 user stories and 1 acceptance criteria, for 1 activities\./)
  assert.match(md, /- As a field engineer, I want the site plan/)
  assert.match(md, /- \[ \] Given a booked survey/)
  assert.match(reportToMarkdown(report), /User stories and acceptance criteria/)
  const sheets = sheetsToMarkdown(report)
  assert.match(sheets, /Branch install/)
  assert.match(sheets, /Given a booked survey/)
})

test('the HTML documentation page is self-contained and escapes every text', async () => {
  const { report } = await load()
  const svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><g data-element-id="A" onclick="alert(1)" onmouseover=alert(2)><a href="javascript:alert(3)">x</a></g><script>alert(4)</script></svg>'
  const clean = cleanSvg(svg)
  assert.doesNotMatch(clean, /onclick|onmouseover|javascript:|<script|<\?xml/)
  assert.match(clean, /data-element-id="A"/)
  const page = docPageHtml({ report, svg })
  assert.match(page, /^<!DOCTYPE html>/i)
  assert.match(page, /<article class="sheet" id="sheet-A"/)
  assert.match(page, /Survey the site &lt;b&gt;/)
  assert.doesNotMatch(page, /Survey the site <b>/)
  assert.doesNotMatch(page, /alert\([1-4]\)/)
  assert.doesNotMatch(page, /<link\b|<script\b[^>]*\bsrc=|@import|url\(http/i)
  assert.equal((page.match(/<script\b/g) || []).length, 1)
})
