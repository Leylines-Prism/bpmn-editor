// Tables de décision DMN (src/dmn/) : écriture d'une table, fusion de deux documents, contrôles
// des règles, liens tâche → décision rangés dans le .bpmn, et arguments des outils du Co-pilote.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { BpmnModdle } from 'bpmn-moddle'
import zeebe from 'zeebe-bpmn-moddle/resources/zeebe.json' with { type: 'json' }
import bpmnpilot from '../src/bpmn-pilot-moddle.json' with { type: 'json' }
import { setDecisionTable, mergeDmn, summarize, checkDecision, parseEntry, quoteStrings, parseDmn } from '../src/dmn/dmn-model.js'
import { evaluateDecision, casesPerRule, inputValue } from '../src/dmn/dmn-eval.js'
import { diffModels } from '../src/dmn/dmn-diff.js'
import { routingHint, flowValue } from '../src/dmn/decision-routing.js'
import { runBatch } from '../src/simulation-stats.js'
import { readDecisionXml, decisionModelUpdates, linkProperties, checkLinks, resultVariable } from '../src/dmn/decision-store.js'
import { createToolSet, runTool } from '../src/ai/chat-loop.js'

const RISK = {
  name: 'Évaluer le risque',
  hitPolicy: 'UNIQUE',
  inputs: [{ label: 'Montant', expression: 'montant', type: 'number' }, { label: 'Catégorie', type: 'string', values: ['Particulier', 'Pro'] }],
  outputs: [{ label: 'Risque', name: 'risque', type: 'string', values: ['faible', 'élevé'] }],
  rules: [
    { inputs: ['< 1000', 'Particulier'], outputs: ['faible'] },
    { inputs: ['>= 1000', '-'], outputs: ['élevé'] },
  ],
}

const codes = (findings) => findings.map((f) => f.code).sort()

test('set_decision_table writes a DMN 1.3 table, quotes text values and draws the DRD', async () => {
  const { xml, decisionId, created } = await setDecisionTable('', RISK)
  assert.equal(created, true)
  assert.equal(decisionId, 'Decision_evaluerLeRisque')
  assert.match(xml, /https:\/\/www\.omg\.org\/spec\/DMN\/20191111\/MODEL\//)
  assert.match(xml, /DMNShape_Decision_evaluerLeRisque/)
  const [d] = (await summarize(xml)).decisions
  assert.equal(d.kind, 'table')
  assert.equal(d.inputs[0].expression, 'montant')
  assert.equal(d.inputs[1].expression, 'categorie')
  assert.equal(d.inputs[1].values, '"Particulier","Pro"')
  assert.deepEqual(d.rules[0].inputs, ['< 1000', '"Particulier"'])
  assert.deepEqual(d.rules[0].outputs, ['"faible"'])
  assert.deepEqual(checkDecision(d), [])
})

test('set_decision_table replaces the table of an existing decision and keeps its id', async () => {
  const first = await setDecisionTable('', RISK)
  const next = await setDecisionTable(first.xml, { ...RISK, decisionId: first.decisionId, hitPolicy: 'FIRST', rules: [] })
  assert.equal(next.created, false)
  const summary = await summarize(next.xml)
  assert.equal(summary.decisions.length, 1)
  assert.equal(summary.decisions[0].hitPolicy, 'FIRST')
  assert.deepEqual(codes(checkDecision(summary.decisions[0])), ['no-rule'])
})

test('set_decision_table refuses a rule with the wrong number of entries', async () => {
  await assert.rejects(setDecisionTable('', { ...RISK, rules: [{ inputs: ['1'], outputs: ['"faible"'] }] }), /1 input entries for 2 inputs/)
})

test('merging two documents renames the ids already taken, references included', async () => {
  const a = await setDecisionTable('', RISK)
  const merged = await mergeDmn(a.xml, a.xml)
  assert.equal(merged.decisions.length, 1)
  assert.equal(merged.renamed.Decision_evaluerLeRisque, 'Decision_evaluerLeRisque_2')
  assert.deepEqual(merged.decisions, ['Decision_evaluerLeRisque_2'])
  const summary = await summarize(merged.xml)
  assert.equal(summary.decisions.length, 2)
  assert.equal(new Set(summary.decisions.map((d) => d.id)).size, 2)
  const second = summary.decisions[1]
  assert.ok(second.requires.every((id) => summary.inputData.some((i) => i.id === id)))
})

test('controls find overlaps, missing quotes, unknown outputs and uncovered values', async () => {
  const { xml } = await setDecisionTable('', {
    ...RISK,
    rules: [
      { inputs: ['[0..1000]', 'Particulier'], outputs: ['faible'] },
      { inputs: ['>= 1000', 'Particulier'], outputs: ['moyen'] },
    ],
  })
  const [d] = (await summarize(xml)).decisions
  const found = checkDecision(d)
  assert.deepEqual(codes(found), ['output-value', 'overlap', 'uncovered'])
  assert.deepEqual(found.find((f) => f.code === 'overlap').rules, [1, 2])
  assert.match(found.find((f) => f.code === 'uncovered').text, /"Pro"/)
  assert.ok(found.every((f) => f.fr))
  // Texte sans guillemets, comme saisi à la main dans la table : FEEL y verrait une variable.
  d.rules[0].inputs[1] = 'Particulier'
  assert.ok(codes(checkDecision(d)).includes('unquoted'))
})

test('open bounds do not overlap, and Any allows overlaps with the same outputs', async () => {
  const { xml } = await setDecisionTable('', { ...RISK, rules: [{ inputs: ['< 1000', '-'], outputs: ['faible'] }, { inputs: ['>= 1000', '-'], outputs: ['élevé'] }] })
  assert.deepEqual(checkDecision((await summarize(xml)).decisions[0]), [])
  const any = await setDecisionTable('', { ...RISK, hitPolicy: 'ANY', rules: [{ inputs: ['<= 1000', '-'], outputs: ['faible'] }, { inputs: ['>= 1000', '-'], outputs: ['faible'] }] })
  assert.deepEqual(checkDecision((await summarize(any.xml)).decisions[0]), [])
  const anyDiff = await setDecisionTable('', { ...RISK, hitPolicy: 'ANY', rules: [{ inputs: ['<= 1000', '-'], outputs: ['faible'] }, { inputs: ['>= 1000', '-'], outputs: ['élevé'] }] })
  assert.deepEqual(codes(checkDecision((await summarize(anyDiff.xml)).decisions[0])), ['overlap-any'])
})

test('FEEL entries are read for numbers, text and booleans, and left alone otherwise', () => {
  assert.deepEqual(parseEntry('-', 'number'), { any: true })
  assert.deepEqual(parseEntry(']10..20)', 'number').ranges, [{ lo: 10, hi: 20, loIn: false, hiIn: false }])
  assert.deepEqual([...parseEntry('"a,b","c"', 'string').values], ['a,b', 'c'])
  assert.deepEqual([...parseEntry('true', 'boolean').values], ['true'])
  assert.equal(parseEntry('not("a")', 'string'), null)
  assert.equal(parseEntry('date("2026-01-01")', 'date'), null)
  assert.equal(quoteStrings('A, B', 'string'), '"A","B"')
  assert.equal(quoteStrings('not("A")', 'string'), 'not("A")')
  assert.equal(quoteStrings('42', 'number'), '42')
  // Une barre oblique inverse est doublée : la chaîne FEEL reste fermée.
  assert.equal(quoteStrings('a\\', 'string'), '"a\\\\"')
})

test('DMN 1.1 files are migrated, a 1.3 namespace in plain text does not count', async () => {
  const v11 = '<definitions xmlns="http://www.omg.org/spec/DMN/20151101/dmn.xsd" id="d" name="D" namespace="https://www.omg.org/spec/DMN/20191111/MODEL/"><decision id="dec" name="Dec"><decisionTable id="t"><input id="i" label="A"><inputExpression id="e" typeRef="string"><text>a</text></inputExpression></input><output id="o" name="r" typeRef="string"/></decisionTable></decision></definitions>'
  const { definitions } = await parseDmn(v11)
  assert.equal(definitions.drgElement[0].id, 'dec')
})

test('the test bench applies the hit policy and builds one case per rule', async () => {
  const [d] = (await summarize((await setDecisionTable('', RISK)).xml)).decisions
  assert.deepEqual(evaluateDecision(d, [500, 'Particulier']), { matched: [1], warnings: [], result: { risque: 'faible' } })
  assert.deepEqual(evaluateDecision(d, { Montant: '1000', categorie: '"Pro"' }).result, { risque: 'élevé' })
  assert.deepEqual(evaluateDecision(d, { Montant: 500, Catégorie: 'Pro' }), { matched: [], warnings: [], result: null })
  assert.throws(() => evaluateDecision(d, ['beaucoup', 'Pro']), /Montant.*not a number/)
  const cases = casesPerRule(d)
  assert.deepEqual(cases, [{ rule: 1, inputs: [999, 'Particulier'] }, { rule: 2, inputs: [1000, 'Particulier'] }])
  for (const c of cases) assert.deepEqual(evaluateDecision(d, c.inputs).matched, [c.rule])

  const unique = (await summarize((await setDecisionTable('', { ...RISK, rules: [{ inputs: ['<= 1000', '-'], outputs: ['faible'] }, { inputs: ['>= 1000', '-'], outputs: ['élevé'] }] })).xml)).decisions[0]
  assert.equal(evaluateDecision(unique, [1000, 'Pro']).error, 'unique-conflict')
  const collect = (await summarize((await setDecisionTable('', { name: 'Frais', hitPolicy: 'COLLECT', aggregation: 'SUM', inputs: [{ label: 'Pays', type: 'string' }], outputs: [{ label: 'Frais', name: 'frais', type: 'number' }], rules: [{ inputs: ['-'], outputs: ['10'] }, { inputs: ['"FR"'], outputs: ['5'] }] })).xml)).decisions[0]
  assert.equal(evaluateDecision(collect, ['FR']).result, 15)
  assert.equal(inputValue('2026-01-31', 'date').toString(), '2026-01-31')
})

const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P"><bpmn:businessRuleTask id="T1" name="Évaluer" /><bpmn:businessRuleTask id="T2" name="Trier" /></bpmn:process>
</bpmn:definitions>`

// Comme modeling.updateModdleProperties : chaque propriété passe par set().
const setAll = (bo, props) => { for (const [k, v] of Object.entries(props)) bo.set(k, v) }

test('the decision model and the task links are kept in the .bpmn, with the Camunda 8 link', async () => {
  const moddle = new BpmnModdle({ bpmnpilot, zeebe })
  const { rootElement: definitions } = await moddle.fromXML(BPMN)
  const process = definitions.rootElements[0]
  const { xml: dmn, decisionId } = await setDecisionTable('', RISK)
  for (const { bo, extensionElements } of decisionModelUpdates(moddle, definitions, process, dmn)) bo.extensionElements = extensionElements
  const [t1, t2] = process.flowElements
  setAll(t1, linkProperties(moddle, t1, decisionId, resultVariable((await summarize(dmn)).decisions[0])))
  t2.set('bpmnpilot:decisionRef', 'Decision_missing')

  const { xml } = await moddle.toXML(definitions)
  assert.match(xml, /bpmnpilot:decisionRef="Decision_evaluerLeRisque"/)
  assert.match(xml, /<zeebe:calledDecision decisionId="Decision_evaluerLeRisque" resultVariable="risque" \/>/)
  const { rootElement: back } = await moddle.fromXML(xml)
  assert.equal(readDecisionXml(back), dmn.trim())
  assert.deepEqual(checkLinks(back, await summarize(readDecisionXml(back))).map((f) => [f.element, f.code]), [['T2', 'missing']])

  const b1 = back.rootElements[0].flowElements[0]
  setAll(b1, linkProperties(moddle, b1, ''))
  const { xml: unlinked } = await moddle.toXML(back)
  assert.doesNotMatch(unlinked, /decisionRef="Decision_evaluerLeRisque"|calledDecision/)
  assert.deepEqual(decisionModelUpdates(moddle, back, back.rootElements[0], '').map((u) => u.extensionElements), [undefined])
})

test('comparing two versions lists added, removed, changed and moved rules', async () => {
  const first = await setDecisionTable('', RISK)
  const before = await summarize(first.xml)
  const after = structuredClone(before)
  const d = after.decisions[0]
  d.hitPolicy = 'FIRST'
  d.rules[0].outputs[0] = '"moyen"'
  d.rules.reverse()
  d.rules.push({ id: 'Rule_new', inputs: ['-', '"Pro"'], outputs: ['"moyen"'], annotation: '' })
  const { changes, rules } = diffModels(before, after)
  assert.deepEqual(changes.map((c) => c.change), ['changed', 'moved', 'changed', 'added'])
  assert.match(changes[2].text, /Rule 2 \(was 1\): Risque: "faible" → "moyen"/)
  assert.deepEqual(rules[d.id], { added: [3], removed: [], changed: [2] })
  assert.deepEqual(diffModels(before, before).changes, [])
  const { changes: gone } = diffModels(before, { ...after, decisions: [] })
  assert.deepEqual(gone.map((c) => c.change), ['removed'])
})

const ROUTED = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P">
    <bpmn:startEvent id="S" /><bpmn:businessRuleTask id="T" /><bpmn:exclusiveGateway id="G" default="fOther" />
    <bpmn:endEvent id="E1" /><bpmn:endEvent id="E2" /><bpmn:endEvent id="E3" />
    <bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="T" /><bpmn:sequenceFlow id="f2" sourceRef="T" targetRef="G" />
    <bpmn:sequenceFlow id="fLow" name="Faible" sourceRef="G" targetRef="E1" />
    <bpmn:sequenceFlow id="fHigh" sourceRef="G" targetRef="E2"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">risque = "élevé"</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="fOther" name="autre" sourceRef="G" targetRef="E3" />
  </bpmn:process>
</bpmn:definitions>`

test('computed tokens follow the decision table after a linked business rule task', async () => {
  const moddle = new BpmnModdle({ bpmnpilot, zeebe })
  const { rootElement: defs } = await moddle.fromXML(ROUTED)
  const summary = await summarize((await setDecisionTable('', { ...RISK, rules: [...RISK.rules, { inputs: ['-', 'Pro'], outputs: ['moyen'] }, { inputs: ['< 0', 'Pro'], outputs: ['faible'] }] })).xml)
  const task = defs.rootElements[0].flowElements.find((e) => e.id === 'T')
  const hint = routingHint(summary, (bo) => (bo === task ? 'Decision_evaluerLeRisque' : ''))
  const flows = Object.fromEntries(defs.rootElements[0].flowElements.map((e) => [e.id, e]))
  assert.equal(flowValue(flows.fHigh, 'risque'), 'élevé')
  assert.equal(flowValue(flows.fLow, 'risque'), 'faible')
  // 4 règles : faible ×2, élevé ×1, moyen ×1 (aucun flux ne le nomme : flux par défaut).
  assert.deepEqual(hint(flows.G, [flows.fLow, flows.fHigh, flows.fOther], [flows.f2]), [0.5, 0.25, 0.25])
  let n = 0
  const random = () => ((n = (n * 9301 + 49297) % 233280) / 233280)
  const result = runBatch(defs, 400, random, { branchHint: hint })
  assert.ok(result.flows.fLow > result.flows.fHigh && result.flows.fHigh > 50)
  // Une probabilité posée sur un flux garde la main.
  flows.fLow.set('bpmnpilot:probability', 90)
  assert.equal(hint(flows.G, [flows.fLow, flows.fHigh, flows.fOther], [flows.f2]), null)
  // Sans lien, rien ne change.
  assert.equal(routingHint(summary, () => '')(flows.G, [flows.fLow, flows.fHigh], [flows.f2]), null)
})

const toolSet = createToolSet(z)
const run = (name, input) => runTool({ toolSet, name, input, executeTool: async () => ({ ok: true }), emit: () => {}, log: () => {} })

test('decision tools are offered and check their arguments', async () => {
  for (const name of ['get_decisions', 'set_decision_table', 'link_decision', 'test_decision']) assert.ok(toolSet.anthropic.some((t) => t.name === name), name)
  assert.equal((await run('get_decisions', {})).isError, false)
  assert.equal((await run('set_decision_table', { ...RISK, linkTo: 'T1' })).isError, false)
  assert.equal((await run('set_decision_table', { ...RISK, hitPolicy: 'SOME' })).isError, true)
  assert.equal((await run('link_decision', { elementId: 'T1', decisionId: '' })).isError, false)
  assert.equal((await run('link_decision', { decisionId: 'D' })).isError, true)
  assert.equal((await run('test_decision', { decisionId: 'D' })).isError, false)
  assert.equal((await run('test_decision', { decisionId: 'D', cases: [[500, 'Pro'], { Montant: 2000, Catégorie: null }] })).isError, false)
  assert.equal((await run('test_decision', { cases: [] })).isError, true)
})
