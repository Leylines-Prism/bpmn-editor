// Process mining (src/mining/) : lecture du CSV et des dates, journal, rapprochement des
// étapes, rejeu sur le diagramme (passages, conformité, écarts), durées, dessin à partir
// du journal, totaux sans donnée de cas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { BpmnModdle } from 'bpmn-moddle'
import { layoutProcess } from 'bpmn-auto-layout'
import { parseCsv, guessColumns, detectSeparator } from '../src/mining/table.js'
import { parseTimestamp, detectDayOrder } from '../src/mining/dates.js'
import { buildLog, fromRecords } from '../src/mining/event-log.js'
import { matchActivities } from '../src/mining/match.js'
import { analyzeLog, aggregateOnly } from '../src/mining/analyze.js'
import { filterGraph, graphToBpmn } from '../src/mining/discover.js'
import { readSaved, savedUpdates, miningFingerprint } from '../src/mining/saved.js'

const ext = JSON.parse(fs.readFileSync(new URL('../src/bpmn-pilot-moddle.json', import.meta.url), 'utf8'))
const moddle = new BpmnModdle({ bpmnpilot: ext })
const read = (f) => fs.readFileSync(new URL(`../public/examples/${f}`, import.meta.url), 'utf8')
const example = async () => {
  const { rootElement } = await moddle.fromXML(read('exemple-commandes.bpmn'))
  const table = parseCsv(read('exemple-commandes.csv'))
  const log = buildLog(table, guessColumns(table.headers), { name: 'exemple-commandes.csv' })
  const nodes = rootElement.rootElements[0].flowElements.filter((e) => e.$instanceOf('bpmn:FlowNode')).map((e) => ({ id: e.id, name: e.name }))
  const found = matchActivities(log.activities.map((a) => a.activity), nodes)
  const mapping = Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v?.id || null]))
  return { definitions: rootElement, log, mapping }
}

test('CSV: separator, quotes and column guess', () => {
  assert.equal(detectSeparator('a;b;c\n1;2;3'), ';')
  assert.equal(detectSeparator('a,b\n1,2'), ',')
  const t = parseCsv('﻿Case ID,Activity,Timestamp,Resource\n1,"Check, then sign","2026-01-02 10:00",Ann\n')
  assert.deepEqual(t.headers, ['Case ID', 'Activity', 'Timestamp', 'Resource'])
  assert.equal(t.rows[0][1], 'Check, then sign')
  assert.deepEqual(guessColumns(t.headers), { case: 0, activity: 1, start: -1, end: 2, resource: 3 })
  assert.deepEqual(guessColumns(['commande', 'etape', 'debut', 'fin', 'ressource']), { case: 0, activity: 1, start: 2, end: 3, resource: 4 })
})

test('Dates: ISO, day/month order, epoch', () => {
  assert.equal(parseTimestamp('2026-03-04T10:00:00Z'), Date.UTC(2026, 2, 4, 10))
  assert.equal(detectDayOrder(['03/04/2026', '25/04/2026']), 'dmy')
  assert.equal(detectDayOrder(['04/25/2026']), 'mdy')
  assert.equal(new Date(parseTimestamp('03/04/2026 08:30', 'dmy')).getMonth(), 3)
  assert.equal(new Date(parseTimestamp('03/04/2026 08:30', 'mdy')).getMonth(), 2)
  assert.equal(parseTimestamp('1767225600'), 1767225600000)
  assert.equal(parseTimestamp(''), null)
  assert.equal(parseTimestamp('31/02/2026x'), null)
})

test('Log: cases sorted by time, rows without a date ignored', () => {
  const t = parseCsv('case;step;time\nA;Two;2026-01-01 10:00\nA;One;2026-01-01 09:00\nB;One;\n')
  const log = buildLog(t, { case: 0, activity: 1, start: -1, end: 2, resource: -1 })
  assert.equal(log.cases.length, 1)
  assert.deepEqual(log.cases[0].events.map((e) => e.activity), ['One', 'Two'])
  assert.equal(log.skipped, 1)
  assert.throws(() => buildLog(t, { case: 0, activity: 1, start: -1, end: -1 }), /columns/)
})

test('Matching: exact, close (accents, case), none', () => {
  const m = matchActivities(['Vérifier le stock', 'verifier paiement', 'Autre'], [{ id: 'S', name: 'Vérifier le stock' }, { id: 'P', name: 'Vérifier le paiement' }])
  assert.deepEqual(m['Vérifier le stock'], { id: 'S', how: 'exact' })
  assert.deepEqual(m['verifier paiement'], { id: 'P', how: 'close' })
  assert.equal(m.Autre, null)
})

test('Replay of the example: passes, branch shares, conformance and deviations', async () => {
  const { definitions, log, mapping } = await example()
  assert.equal(mapping['Relancer le client'], null)
  const r = analyzeLog(log, mapping, definitions)
  assert.equal(r.cases, 412)
  assert.equal(r.nodes.Paiement, 412)
  assert.equal(r.flows.F4, 24)
  assert.equal(Math.round(r.branches.F3.share * 100), 94)
  assert.equal(r.conformance.fitting, 345)
  const dev = (kind, el) => r.conformance.deviations.find((d) => d.kind === kind && (d.element === el || d.activity === el))
  assert.equal(dev('order', 'Facturer').cases, 26)
  assert.equal(dev('order', 'Facturer').other, 'Expedier')
  assert.equal(dev('skipped', 'Stock').cases, 17)
  assert.equal(dev('outside', 'Relancer le client').cases, 20)
  assert.equal(dev('unfinished', 'Stock').cases, 5)
  assert.equal(r.conformance.deviations.length, 4)
  assert.equal(r.bottlenecks[0], 'Preparer')
  assert.ok(r.timing.Preparer.wait.median > 20 * 3600e3)
})

test('Replay through a parallel split and join', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D"><bpmn:process id="P">
<bpmn:startEvent id="S"/><bpmn:task id="A" name="A"/><bpmn:parallelGateway id="G1"/><bpmn:task id="B" name="B"/><bpmn:task id="C" name="C"/><bpmn:parallelGateway id="G2"/><bpmn:task id="D2" name="D"/><bpmn:endEvent id="E"/>
<bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="A"/><bpmn:sequenceFlow id="f2" sourceRef="A" targetRef="G1"/><bpmn:sequenceFlow id="f3" sourceRef="G1" targetRef="B"/><bpmn:sequenceFlow id="f4" sourceRef="G1" targetRef="C"/>
<bpmn:sequenceFlow id="f5" sourceRef="B" targetRef="G2"/><bpmn:sequenceFlow id="f6" sourceRef="C" targetRef="G2"/><bpmn:sequenceFlow id="f7" sourceRef="G2" targetRef="D2"/><bpmn:sequenceFlow id="f8" sourceRef="D2" targetRef="E"/>
</bpmn:process></bpmn:definitions>`
  const { rootElement } = await moddle.fromXML(xml)
  const rec = (c, steps) => steps.map((a, i) => ({ case: c, activity: a, start: i * 1000, end: i * 1000 }))
  const log = fromRecords([...rec('1', ['A', 'B', 'C', 'D']), ...rec('2', ['A', 'C', 'B', 'D']), ...rec('3', ['A', 'B', 'D'])])
  const r = analyzeLog(log, { A: 'A', B: 'B', C: 'C', D: 'D2' }, rootElement)
  assert.equal(r.conformance.fitting, 2)
  assert.equal(r.conformance.deviations[0].kind, 'skipped')
  assert.equal(r.conformance.deviations[0].element, 'C')
})

test('Discovery: filtered graph, BPMN with probabilities, layout', async () => {
  const { log } = await example()
  const traces = log.cases.map((c) => c.events.map((e) => e.activity))
  const g = filterGraph(traces, { activities: 1, paths: 0.9 })
  assert.equal(g.activities.length, 9)
  assert.ok(g.hidden.paths > 0)
  const xml = graphToBpmn(g, { processName: 'Orders', startName: 'Start', endName: 'End' })
  const { xml: laid } = await layoutProcess(xml)
  const { rootElement, warnings } = await moddle.fromXML(laid)
  assert.equal(warnings.length, 0)
  const flows = rootElement.rootElements[0].flowElements.filter((e) => e.$instanceOf('bpmn:SequenceFlow'))
  const probs = flows.map((f) => f.get('bpmnpilot:probability')).filter((p) => p !== undefined)
  assert.ok(probs.length >= 4)
  assert.ok(laid.includes('bpmndi:BPMNShape'))
  const fewer = filterGraph(traces, { activities: 0.5, paths: 0.5 })
  assert.ok(fewer.activities.length < 9)
})

test('Saved totals: no case id, read back, fingerprint ignores probabilities', async () => {
  const { definitions, log, mapping } = await example()
  const agg = aggregateOnly(analyzeLog(log, mapping, definitions))
  assert.ok(!JSON.stringify(agg).includes('C-10'))
  assert.ok(!JSON.stringify(agg).includes('Agent'))
  const before = miningFingerprint(definitions)
  const updates = savedUpdates(moddle, definitions, agg, { source: 'x.csv', fingerprint: before })
  for (const u of updates) u.bo.extensionElements = u.extensionElements
  const { xml } = await moddle.toXML(definitions)
  const { rootElement } = await moddle.fromXML(xml)
  const saved = readSaved(rootElement)
  assert.equal(saved.source, 'x.csv')
  assert.equal(saved.data.cases, 412)
  const flow = rootElement.rootElements[0].flowElements.find((e) => e.id === 'F3')
  flow.set('bpmnpilot:probability', 50)
  assert.equal(miningFingerprint(rootElement), before)
  for (const u of savedUpdates(moddle, rootElement, null)) u.bo.extensionElements = u.extensionElements
  assert.equal(readSaved(rootElement), null)
})
