// Modèle de décision DMN rangé dans le diagramme (mode Expert).
//
// Le .bpmn garde un seul document DMN 1.3 complet (décisions, données d'entrée, DRD), dans
// l'extension bpmnpilot:decisionModel du processus ou de la collaboration (voir
// src/dmn/decision-store.js). Une tâche de règle métier pointe vers une décision par son id
// (bpmnpilot:decisionRef, et zeebe:calledDecision pour les outils Camunda 8).
//
// Ce module lit et écrit ce document avec dmn-moddle, sans dmn-js : il sert au panneau, au
// rapport, aux contrôles et aux outils du Co-pilote, et tourne dans les tests (Node).

import { DmnModdle } from 'dmn-moddle'
import { migrateDiagram } from '@bpmn-io/dmn-migrate'

export const DMN13_NS = 'https://www.omg.org/spec/DMN/20191111/MODEL/'
export const HIT_POLICIES = ['UNIQUE', 'FIRST', 'PRIORITY', 'ANY', 'COLLECT', 'RULE ORDER', 'OUTPUT ORDER']
export const AGGREGATIONS = ['SUM', 'MIN', 'MAX', 'COUNT']
export const TYPES = ['string', 'number', 'boolean', 'date', 'time', 'dateTime', 'dayTimeDuration', 'yearMonthDuration']
export const MAX_DMN_BYTES = 2 * 1024 * 1024

const moddle = () => new DmnModdle()
const randomPart = () => Math.random().toString(36).slice(2, 9)
export const newId = (prefix) => `${prefix}_${randomPart()}`
const isA = (el, type) => !!el?.$instanceOf?.(type)

// ── Lecture et écriture ──

// Lit un document DMN. Les versions 1.1 et 1.2 sont d'abord portées en 1.3, comme le fait
// Camunda Modeler. Lève une erreur lisible si le texte n'est pas un DMN.
export async function parseDmn(xml) {
  const text = String(xml || '')
  if (!text.trim()) throw new Error('empty DMN document')
  if (text.length > MAX_DMN_BYTES) throw new Error('DMN document too large')
  if (!/<([\w-]+:)?definitions[\s>]/.test(text)) throw new Error('not a DMN document (no definitions element)')
  let source = text
  // Version lue dans la déclaration d'espace de noms (xmlns ou xmlns:préfixe), pas n'importe où dans le texte.
  const ns13 = /\sxmlns(:[\w-]+)?=["']https:\/\/www\.omg\.org\/spec\/DMN\/20191111\/MODEL\/["']/
  if (!ns13.test(text)) {
    try {
      source = await migrateDiagram(text)
    } catch (err) {
      throw new Error(`unsupported DMN version: ${err.message}`, { cause: err })
    }
  }
  const { rootElement, warnings } = await moddle().fromXML(source, 'dmn:Definitions')
  if (!rootElement || !isA(rootElement, 'dmn:Definitions')) throw new Error('not a DMN document')
  return { definitions: rootElement, warnings: warnings || [] }
}

export async function toXml(definitions) {
  const { xml } = await moddle().toXML(definitions, { format: true })
  return xml
}

// ── Résumé ──

const text = (expr) => (expr?.text ?? '').trim()

function describeDecision(decision) {
  const logic = decision.decisionLogic
  const out = { id: decision.id, name: decision.name || '' }
  if (isA(logic, 'dmn:DecisionTable')) {
    out.kind = 'table'
    out.hitPolicy = logic.hitPolicy || 'UNIQUE'
    if (logic.aggregation) out.aggregation = logic.aggregation
    out.inputs = (logic.input || []).map((i) => ({
      id: i.id,
      label: i.label || '',
      expression: text(i.inputExpression),
      type: i.inputExpression?.typeRef || '',
      values: text(i.inputValues),
    }))
    out.outputs = (logic.output || []).map((o) => ({
      id: o.id,
      label: o.label || '',
      name: o.name || '',
      type: o.typeRef || '',
      values: text(o.outputValues),
    }))
    out.rules = (logic.rule || []).map((r) => ({
      id: r.id,
      inputs: (r.inputEntry || []).map(text),
      outputs: (r.outputEntry || []).map(text),
      annotation: (r.description || '').trim(),
    }))
  } else if (isA(logic, 'dmn:LiteralExpression')) {
    out.kind = 'literal'
    out.expression = text(logic)
    if (decision.variable?.typeRef) out.type = decision.variable.typeRef
  } else {
    out.kind = logic ? 'other' : 'empty'
  }
  const req = (list, key) => (list || []).map((r) => (r[key]?.href || '').replace(/^#/, '')).filter(Boolean)
  const needs = [...req(decision.informationRequirement, 'requiredDecision'), ...req(decision.informationRequirement, 'requiredInput')]
  if (needs.length) out.requires = needs
  const knowledge = req(decision.knowledgeRequirement, 'requiredKnowledge')
  if (knowledge.length) out.knowledge = knowledge
  return out
}

// { name, decisions: [...], inputData: [{id, name}], others: n }
export function summarizeDefinitions(definitions) {
  const drg = definitions?.drgElement || []
  return {
    id: definitions?.id || '',
    name: definitions?.name || '',
    decisions: drg.filter((e) => isA(e, 'dmn:Decision')).map(describeDecision),
    inputData: drg.filter((e) => isA(e, 'dmn:InputData')).map((e) => ({ id: e.id, name: e.name || '' })),
    knowledge: drg.filter((e) => isA(e, 'dmn:BusinessKnowledgeModel') || isA(e, 'dmn:KnowledgeSource')).map((e) => ({ id: e.id, name: e.name || '', type: e.$type.replace('dmn:', '') })),
  }
}

export async function summarize(xml) {
  if (!xml) return { id: '', name: '', decisions: [], inputData: [], knowledge: [] }
  return summarizeDefinitions((await parseDmn(xml)).definitions)
}

// ── Création ──

function emptyDefinitions(m, name) {
  return m.create('dmn:Definitions', {
    id: newId('Definitions'),
    name: name || 'Decisions',
    namespace: 'http://example.com/dmn',
    drgElement: [],
    dmnDI: m.create('dmndi:DMNDI', { diagrams: [m.create('dmndi:DMNDiagram', { id: newId('DMNDiagram'), diagramElements: [] })] }),
  })
}

const diagramOf = (m, definitions) => {
  if (!definitions.dmnDI) definitions.dmnDI = m.create('dmndi:DMNDI', { diagrams: [] })
  if (!definitions.dmnDI.diagrams?.length) definitions.dmnDI.diagrams = [m.create('dmndi:DMNDiagram', { id: newId('DMNDiagram'), diagramElements: [] })]
  const diagram = definitions.dmnDI.diagrams[0]
  if (!diagram.diagramElements) diagram.diagramElements = []
  return diagram
}

// Rectangle libre à droite de tout ce qui est déjà dessiné.
function freeX(definitions) {
  let max = 120
  for (const d of definitions.dmnDI?.diagrams || []) {
    for (const el of d.diagramElements || []) {
      if (el.bounds) max = Math.max(max, el.bounds.x + el.bounds.width + 80)
      for (const p of el.waypoint || []) max = Math.max(max, p.x + 80)
    }
  }
  return max
}

const shape = (m, element, x, y, width, height) =>
  m.create('dmndi:DMNShape', { id: `DMNShape_${element.id}`, dmnElementRef: element, bounds: m.create('dc:Bounds', { x, y, width, height }) })

const edge = (m, requirement, from, to) =>
  m.create('dmndi:DMNEdge', {
    id: `DMNEdge_${requirement.id}`,
    dmnElementRef: requirement,
    waypoint: [m.create('dc:Point', { x: from.x, y: from.y }), m.create('dc:Point', { x: to.x, y: to.y })],
  })

// Met les guillemets FEEL qui manquent à une valeur de type string : A → "A", A, B → "A","B".
// Laisse intacts « - », les expressions (not(...), comparaisons) et ce qui est déjà entre guillemets.
export function quoteStrings(value, type) {
  const v = String(value ?? '').trim()
  if (type !== 'string' || !v || v === '-' || /^not\s*\(/.test(v) || /["(<>=[\]]/.test(v) || /^(null|true|false)$/.test(v)) return v
  return v.split(',').map((s) => s.trim()).filter(Boolean).map((s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')
}

const valueList = (values, type) => (Array.isArray(values) ? values : values ? [values] : []).map((v) => quoteStrings(v, type)).filter(Boolean).join(',')

function buildTable(m, spec, previous) {
  const hitPolicy = HIT_POLICIES.includes(spec.hitPolicy) ? spec.hitPolicy : 'UNIQUE'
  const inputs = spec.inputs || []
  const outputs = spec.outputs || []
  if (!inputs.length) throw new Error('A decision table needs at least one input.')
  if (!outputs.length) throw new Error('A decision table needs at least one output.')
  const table = m.create('dmn:DecisionTable', {
    id: previous?.id || newId('DecisionTable'),
    hitPolicy,
    input: inputs.map((i, n) => {
      const type = i.type || 'string'
      const input = m.create('dmn:InputClause', {
        id: newId('Input'),
        label: i.label || i.expression || `Input ${n + 1}`,
        inputExpression: m.create('dmn:LiteralExpression', { id: newId('InputExpression'), typeRef: type, text: i.expression || camel(i.label) || `input${n + 1}` }),
      })
      const values = valueList(i.values, type)
      if (values) input.inputValues = m.create('dmn:UnaryTests', { id: newId('UnaryTests'), text: values })
      return input
    }),
    output: outputs.map((o, n) => {
      const type = o.type || 'string'
      const output = m.create('dmn:OutputClause', { id: newId('Output'), label: o.label || o.name || `Output ${n + 1}`, name: o.name || camel(o.label) || `output${n + 1}`, typeRef: type })
      const values = valueList(o.values, type)
      if (values) output.outputValues = m.create('dmn:UnaryTests', { id: newId('UnaryTests'), text: values })
      return output
    }),
  })
  if (hitPolicy === 'COLLECT' && AGGREGATIONS.includes(spec.aggregation)) table.aggregation = spec.aggregation
  table.rule = (spec.rules || []).map((r, n) => {
    const ins = r.inputs || []
    const outs = r.outputs || []
    if (ins.length !== inputs.length) throw new Error(`Rule ${n + 1} has ${ins.length} input entries for ${inputs.length} inputs.`)
    if (outs.length !== outputs.length) throw new Error(`Rule ${n + 1} has ${outs.length} output entries for ${outputs.length} outputs.`)
    const rule = m.create('dmn:DecisionRule', {
      id: newId('Rule'),
      inputEntry: ins.map((v, k) => m.create('dmn:UnaryTests', { id: newId('UnaryTests'), text: quoteStrings(v === '' ? '-' : v, inputs[k].type || 'string') })),
      outputEntry: outs.map((v, k) => m.create('dmn:LiteralExpression', { id: newId('LiteralExpression'), text: quoteStrings(v, outputs[k].type || 'string') })),
    })
    if (r.annotation) rule.description = String(r.annotation)
    return rule
  })
  return table
}

function camel(label) {
  const words = String(label || '').normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[A-Za-z0-9]+/g)
  if (!words) return ''
  const name = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('')
  return /^[0-9]/.test(name) ? `v${name}` : name
}

// Crée ou remplace la table d'une décision du document. spec : { decisionId?, name, hitPolicy,
// aggregation?, inputs, outputs, rules } (voir l'outil set_decision_table). Une nouvelle décision
// est dessinée dans le DRD avec ses données d'entrée. Renvoie { xml, decisionId, created }.
export async function setDecisionTable(xml, spec) {
  const m = moddle()
  const definitions = xml ? (await parseDmn(xml)).definitions : emptyDefinitions(m, spec.modelName)
  definitions.drgElement ||= []
  const ids = collectIds(definitions)
  let decision = spec.decisionId ? definitions.drgElement.find((e) => isA(e, 'dmn:Decision') && e.id === spec.decisionId) : null
  if (spec.decisionId && !decision && !validId(spec.decisionId)) throw new Error(`Invalid decision id: ${spec.decisionId}`)
  const created = !decision
  if (created) {
    let id = spec.decisionId || `Decision_${camel(spec.name) || randomPart()}`
    if (!validId(id)) id = newId('Decision')
    while (ids.has(id)) id = `${id}_${randomPart().slice(0, 3)}`
    decision = m.create('dmn:Decision', { id, name: spec.name || id })
    definitions.drgElement.push(decision)
  } else if (spec.name) decision.name = spec.name
  decision.decisionLogic = buildTable(m, spec, isA(decision.decisionLogic, 'dmn:DecisionTable') ? decision.decisionLogic : null)
  decision.decisionLogic.$parent = decision

  if (created) {
    const diagram = diagramOf(m, definitions)
    const x = freeX(definitions)
    const top = 80
    diagram.diagramElements.push(shape(m, decision, x, top, 180, 80))
    decision.informationRequirement = []
    ;(spec.inputs || []).forEach((input, n) => {
      const data = m.create('dmn:InputData', { id: newId('InputData'), name: input.label || input.expression || `Input ${n + 1}` })
      definitions.drgElement.push(data)
      const req = m.create('dmn:InformationRequirement', { id: newId('InformationRequirement'), requiredInput: m.create('dmn:DMNElementReference', { href: `#${data.id}` }) })
      decision.informationRequirement.push(req)
      const ix = x + n * 160 - ((spec.inputs.length - 1) * 160) / 2 + 27
      diagram.diagramElements.push(shape(m, data, ix, top + 170, 125, 45))
      diagram.diagramElements.push(edge(m, req, { x: ix + 62, y: top + 170 }, { x: x + 90, y: top + 80 }))
    })
  }
  return { xml: await toXml(definitions), decisionId: decision.id, created }
}

// Document neuf avec une décision et sa table vide (1 entrée, 1 sortie), pour « Créer une
// table de décision » depuis le panneau.
export async function addEmptyDecision(xml, { name, inputLabel = 'Input', outputLabel = 'Output' } = {}) {
  return setDecisionTable(xml, {
    name: name || 'Decision',
    hitPolicy: 'UNIQUE',
    inputs: [{ label: inputLabel, expression: camel(inputLabel) || 'input', type: 'string' }],
    outputs: [{ label: outputLabel, name: camel(outputLabel) || 'output', type: 'string' }],
    rules: [],
  })
}

// Retire une décision (et ce qui la dessine). Les données d'entrée restent.
export async function removeDecision(xml, decisionId) {
  const { definitions } = await parseDmn(xml)
  const decision = (definitions.drgElement || []).find((e) => isA(e, 'dmn:Decision') && e.id === decisionId)
  if (!decision) throw new Error(`Decision not found: ${decisionId}`)
  const gone = new Set([decision, ...(decision.informationRequirement || []), ...(decision.knowledgeRequirement || []), ...(decision.authorityRequirement || [])])
  definitions.drgElement = definitions.drgElement.filter((e) => e !== decision)
  for (const other of definitions.drgElement) {
    for (const key of ['informationRequirement', 'knowledgeRequirement', 'authorityRequirement']) {
      if (!other[key]) continue
      const kept = other[key].filter((r) => !Object.values(r).some((ref) => ref?.href === `#${decisionId}`))
      for (const r of other[key]) if (!kept.includes(r)) gone.add(r)
      other[key] = kept
    }
  }
  for (const d of definitions.dmnDI?.diagrams || []) d.diagramElements = (d.diagramElements || []).filter((el) => !gone.has(el.dmnElementRef))
  return toXml(definitions)
}

// ── Fusion (Ouvrir un .dmn, Mes diagrammes) ──

const validId = (id) => typeof id === 'string' && /^[A-Za-z_][\w.-]*$/.test(id)

function walkObjects(root, visit, seen = new Set()) {
  if (!root || typeof root !== 'object' || seen.has(root)) return
  seen.add(root)
  if (root.$type) visit(root)
  for (const [key, value] of Object.entries(root)) {
    if (key.startsWith('$') || key === 'dmnElementRef') continue
    if (Array.isArray(value)) value.forEach((v) => walkObjects(v, visit, seen))
    else if (value && typeof value === 'object' && value.$type) walkObjects(value, visit, seen)
  }
}

function collectIds(definitions) {
  const ids = new Set()
  walkObjects(definitions, (o) => { if (o.id) ids.add(o.id) })
  return ids
}

// Ajoute au document `baseXml` (ou à un document neuf) les éléments de `addXml`. Les ids déjà
// pris sont renommés, références comprises, et le DRD ajouté est décalé à droite.
// Renvoie { xml, renamed: { ancien: nouveau }, decisions: [ids ajoutés] }.
export async function mergeDmn(baseXml, addXml) {
  const { definitions: added } = await parseDmn(addXml)
  if (!baseXml) {
    const summary = summarizeDefinitions(added)
    return { xml: await toXml(added), renamed: {}, decisions: summary.decisions.map((d) => d.id) }
  }
  const { definitions: base } = await parseDmn(baseXml)
  const m = moddle()
  const taken = collectIds(base)
  const renamed = {}
  walkObjects(added, (o) => {
    if (o.id && taken.has(o.id) && !isA(o, 'dmn:Definitions')) {
      let id = `${o.id}_2`
      for (let n = 3; taken.has(id); n++) id = `${o.id}_${n}`
      renamed[o.id] = id
      o.id = id
    }
    if (o.id) taken.add(o.id)
  })
  if (Object.keys(renamed).length) {
    walkObjects(added, (o) => {
      if (o.href?.startsWith('#') && renamed[o.href.slice(1)]) o.href = `#${renamed[o.href.slice(1)]}`
    })
  }
  const dx = freeX(base) - 120
  base.drgElement = [...(base.drgElement || []), ...(added.drgElement || [])]
  base.artifact = [...(base.artifact || []), ...(added.artifact || [])]
  const target = diagramOf(m, base)
  for (const d of added.dmnDI?.diagrams || []) {
    for (const el of d.diagramElements || []) {
      if (el.bounds) el.bounds.x += dx
      for (const p of el.waypoint || []) p.x += dx
      target.diagramElements.push(el)
    }
  }
  const decisions = (added.drgElement || []).filter((e) => isA(e, 'dmn:Decision')).map((e) => e.id)
  return { xml: await toXml(base), renamed, decisions }
}

// ── Contrôles ──

// Ensemble de valeurs décrit par une entrée FEEL simple : nombres (comparaisons, intervalles,
// valeurs), chaînes entre guillemets, booléens. null si l'entrée sort de ces formes : elle
// n'est alors pas comparée.
export function parseEntry(entry, type) {
  const v = String(entry ?? '').trim()
  if (v === '' || v === '-') return { any: true }
  if (/^not\s*\(/.test(v)) return null
  const parts = splitTopLevel(v)
  if (type === 'number') {
    const ranges = []
    for (const p of parts) {
      const r = numberRange(p)
      if (!r) return null
      ranges.push(r)
    }
    return { ranges }
  }
  if (type === 'string') {
    const values = []
    for (const p of parts) {
      const m = /^"((?:[^"\\]|\\.)*)"$/.exec(p)
      if (!m) return null
      values.push(m[1])
    }
    return { values: new Set(values) }
  }
  if (type === 'boolean') {
    if (parts.every((p) => p === 'true' || p === 'false')) return { values: new Set(parts) }
    return null
  }
  return null
}

// Coupe aux virgules hors des guillemets et des parenthèses (les intervalles « a..b » n'en ont pas).
function splitTopLevel(v) {
  const out = []
  let depth = 0
  let quote = false
  let cur = ''
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (c === '"' && v[i - 1] !== '\\') quote = !quote
    else if (!quote && c === '(') depth++
    else if (!quote && c === ')') depth--
    else if (!quote && c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const NUM = '(-?\\d+(?:\\.\\d+)?)'
function numberRange(p) {
  let m = new RegExp(`^(<=|>=|<|>|=)?\\s*${NUM}$`).exec(p)
  if (m) {
    const n = Number(m[2])
    switch (m[1]) {
      case '<': return { lo: -Infinity, hi: n, loIn: false, hiIn: false }
      case '<=': return { lo: -Infinity, hi: n, loIn: false, hiIn: true }
      case '>': return { lo: n, hi: Infinity, loIn: false, hiIn: false }
      case '>=': return { lo: n, hi: Infinity, loIn: true, hiIn: false }
      default: return { lo: n, hi: n, loIn: true, hiIn: true }
    }
  }
  m = new RegExp(`^([\\[\\]\\(])\\s*${NUM}\\s*\\.\\.\\s*${NUM}\\s*([\\[\\]\\)])$`).exec(p)
  if (m) return { lo: Number(m[2]), hi: Number(m[3]), loIn: m[1] === '[', hiIn: m[4] === ']' }
  return null
}

function rangesMeet(a, b) {
  const lo = Math.max(a.lo, b.lo)
  const hi = Math.min(a.hi, b.hi)
  if (lo < hi) return true
  if (lo > hi) return false
  const inA = (x) => (x > a.lo || (x === a.lo && a.loIn)) && (x < a.hi || (x === a.hi && a.hiIn))
  const inB = (x) => (x > b.lo || (x === b.lo && b.loIn)) && (x < b.hi || (x === b.hi && b.hiIn))
  return inA(lo) && inB(lo)
}

// true : les deux entrées ont au moins une valeur en commun ; false : aucune ; null : on ne sait pas.
function entriesMeet(a, b) {
  if (!a || !b) return null
  if (a.any || b.any) return true
  if (a.ranges && b.ranges) return a.ranges.some((x) => b.ranges.some((y) => rangesMeet(x, y)))
  if (a.values && b.values) return [...a.values].some((x) => b.values.has(x))
  return null
}

const listValues = (text) => {
  const parsed = parseEntry(text, 'string')
  return parsed?.values ? [...parsed.values] : null
}

// Constats sur une décision résumée par summarize() : [{ level: 'error'|'warning'|'info', code, text, rules? }].
// text en anglais (Co-pilote, serveur MCP), fr pour l'interface en français.
export function checkDecision(d) {
  const out = []
  if (d.kind !== 'table') {
    if (d.kind === 'empty') out.push({ level: 'warning', code: 'no-logic', text: `Decision "${d.name || d.id}" has no decision logic.`, fr: `La décision « ${d.name || d.id} » n'a pas encore de logique de décision.` })
    return out
  }
  if (!d.inputs.length) out.push({ level: 'error', code: 'no-input', text: 'The table has no input.', fr: 'La table n\'a aucune entrée.' })
  if (!d.outputs.length) out.push({ level: 'error', code: 'no-output', text: 'The table has no output.', fr: 'La table n\'a aucune sortie.' })
  if (!d.rules.length) {
    out.push({ level: 'warning', code: 'no-rule', text: 'The table has no rule yet.', fr: 'La table n\'a pas encore de règle.' })
    return out
  }
  // Chaînes sans guillemets : FEEL les lirait comme des noms de variables.
  d.rules.forEach((r, n) => {
    r.inputs.forEach((v, k) => {
      if (d.inputs[k]?.type === 'string' && v && v !== '-' && !/^not\s*\(/.test(v) && !/["<>=(]/.test(v) && !/^(null)$/.test(v)) {
        out.push({ level: 'warning', code: 'unquoted', text: `Rule ${n + 1}, input "${d.inputs[k].label}": text values go between double quotes (${v} → "${v}").`, fr: `Règle ${n + 1}, entrée « ${d.inputs[k].label} » : un texte s'écrit entre guillemets droits (${v} → "${v}").`, rules: [n + 1] })
      }
    })
  })
  // Sorties hors des valeurs permises.
  d.outputs.forEach((o, k) => {
    const allowed = listValues(o.values)
    if (!allowed) return
    d.rules.forEach((r, n) => {
      const v = parseEntry(r.outputs[k], 'string')
      if (v?.values && [...v.values].some((x) => !allowed.includes(x))) {
        out.push({ level: 'error', code: 'output-value', text: `Rule ${n + 1}: output "${o.label || o.name}" gives ${r.outputs[k]}, which is not among its allowed values (${o.values}).`, fr: `Règle ${n + 1} : la sortie « ${o.label || o.name} » donne ${r.outputs[k]}, qui n'est pas parmi ses valeurs prévues (${o.values}).`, rules: [n + 1] })
      }
    })
  })
  // Chevauchements : avec la politique Unique, une seule règle peut s'appliquer ; avec Any, les
  // règles qui se chevauchent doivent donner les mêmes sorties.
  if (d.hitPolicy === 'UNIQUE' || d.hitPolicy === 'ANY') {
    const parsed = d.rules.map((r) => r.inputs.map((v, k) => parseEntry(v, d.inputs[k]?.type)))
    for (let a = 0; a < d.rules.length; a++) {
      for (let b = a + 1; b < d.rules.length; b++) {
        const meet = parsed[a].map((e, k) => entriesMeet(e, parsed[b][k]))
        if (meet.some((x) => x === false) || meet.some((x) => x === null)) continue
        if (d.hitPolicy === 'ANY' && d.rules[a].outputs.join('|') === d.rules[b].outputs.join('|')) continue
        out.push(d.hitPolicy === 'UNIQUE'
          ? { level: 'error', code: 'overlap', text: `Rules ${a + 1} and ${b + 1} can both apply, which the Unique hit policy forbids. Narrow one of them, or choose First or Priority.`, fr: `Les règles ${a + 1} et ${b + 1} peuvent s'appliquer ensemble, ce que la politique Unique interdit. Resserrez l'une d'elles, ou choisissez Première ou Priorité.`, rules: [a + 1, b + 1] }
          : { level: 'error', code: 'overlap-any', text: `Rules ${a + 1} and ${b + 1} can both apply with different outputs, which the Any hit policy forbids.`, fr: `Les règles ${a + 1} et ${b + 1} peuvent s'appliquer ensemble avec des sorties différentes, ce que la politique Toutes interdit.`, rules: [a + 1, b + 1] })
      }
    }
  }
  // Valeurs d'entrée prévues mais couvertes par aucune règle.
  d.inputs.forEach((input, k) => {
    if (input.type !== 'string') return
    const values = listValues(input.values)
    if (!values) return
    const parsed = d.rules.map((r) => parseEntry(r.inputs[k], 'string'))
    if (parsed.some((p) => p === null || p.any)) return
    const missing = values.filter((v) => !parsed.some((p) => p.values.has(v)))
    if (missing.length) out.push({ level: 'warning', code: 'uncovered', text: `Input "${input.label}": no rule covers ${missing.map((v) => `"${v}"`).join(', ')}.`, fr: `Entrée « ${input.label} » : aucune règle ne couvre ${missing.map((v) => `"${v}"`).join(', ')}.` })
  })
  return out
}
