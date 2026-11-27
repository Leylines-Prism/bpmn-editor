// Évaluation d'une table de décision, pour le banc d'essai de la fenêtre DMN et l'outil
// test_decision du Co-pilote et du serveur MCP.
//
// La table vient de summarize() (dmn-model.js). Les expressions sont évaluées par feelin
// (bpmn.io, MIT) : entrées en tests unaires FEEL, sorties en expressions FEEL. Ce module ne
// dépend pas de la page : il tourne aussi dans les tests.

import { unaryTest, evaluate } from 'feelin'
import { parseEntry } from './dmn-model.js'

const FEEL_CALL = { date: 'date', time: 'time', dateTime: 'date and time', dayTimeDuration: 'duration', yearMonthDuration: 'duration' }
const IDENT = /^[A-Za-z_][\w]*$/

// Valeur saisie (texte, nombre, booléen) → valeur FEEL du type de l'entrée.
// '' ou null donne null. Lève une erreur si la valeur ne se lit pas dans ce type.
export function inputValue(raw, type) {
  if (raw === null || raw === undefined || raw === '') return null
  if (type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'))
    if (!Number.isFinite(n)) throw new Error(`"${raw}" is not a number.`)
    return n
  }
  if (type === 'boolean') {
    if (raw === true || raw === false) return raw
    const v = String(raw).trim().toLowerCase()
    if (v === 'true' || v === 'vrai') return true
    if (v === 'false' || v === 'faux') return false
    throw new Error(`"${raw}" is not true or false.`)
  }
  if (FEEL_CALL[type]) {
    const text = String(raw).trim().replace(/^"(.*)"$/, '$1')
    const { value } = evaluate(`${FEEL_CALL[type]}("${text.replace(/"/g, '')}")`, {})
    if (value === null || value === undefined) throw new Error(`"${raw}" is not a valid ${type}.`)
    return value
  }
  // Texte : on accepte la valeur avec ou sans guillemets.
  return String(raw).replace(/^"(.*)"$/, '$1')
}

// Contexte FEEL : la valeur de chaque entrée sous le nom de son expression, quand c'en est un.
function contextOf(d, values) {
  const ctx = {}
  d.inputs.forEach((input, k) => { if (IDENT.test(input.expression || '')) ctx[input.expression] = values[k] })
  return ctx
}

function entryMatches(entry, value, ctx) {
  const text = String(entry ?? '').trim()
  if (text === '' || text === '-') return { ok: true }
  try {
    const { value: result } = unaryTest(text, { ...ctx, '?': value })
    return { ok: result === true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function outputOf(d, rule, ctx) {
  const out = {}
  const errors = []
  d.outputs.forEach((o, k) => {
    const key = o.name || o.label || `output${k + 1}`
    const text = String(rule.outputs[k] ?? '').trim()
    if (!text) { out[key] = null; return }
    try {
      out[key] = evaluate(text, ctx).value ?? null
    } catch (err) {
      out[key] = null
      errors.push(err.message)
    }
  })
  return { out, errors }
}

// Rang d'une sortie dans ses valeurs prévues (politiques Priorité et Ordre des sorties) :
// la première valeur listée passe en premier.
function priority(d, result) {
  const o = d.outputs[0]
  if (!o) return 0
  const allowed = parseEntry(o.values, 'string')
  if (!allowed?.values) return 0
  const list = [...allowed.values]
  const v = result[o.name || o.label || 'output1']
  const n = list.indexOf(v)
  return n === -1 ? list.length : n
}

// Évalue la décision `d` (résumé de summarize) pour les valeurs `raw` des entrées (dans l'ordre
// des colonnes, ou par libellé ou expression). Renvoie
// { matched: [n° de règle], result, error?, warnings: [] }. result est un objet { sortie: valeur }
// pour Unique, Première, Priorité et Toutes, une liste pour Collecter (sans agrégat), Ordre des
// règles et Ordre des sorties, un nombre pour Collecter avec agrégat, null si aucune règle.
export function evaluateDecision(d, raw) {
  if (d?.kind !== 'table') throw new Error('Only decision tables can be tested.')
  const values = d.inputs.map((input, k) => {
    const given = Array.isArray(raw) ? raw[k] : raw?.[input.label] ?? raw?.[input.expression] ?? raw?.[input.id] ?? raw?.[k]
    try {
      return inputValue(given, input.type || 'string')
    } catch (err) {
      throw new Error(`Input "${input.label || input.expression}": ${err.message}`, { cause: err })
    }
  })
  const ctx = contextOf(d, values)
  const warnings = []
  const hits = []
  d.rules.forEach((rule, n) => {
    let all = true
    rule.inputs.forEach((entry, k) => {
      if (!all) return
      const m = entryMatches(entry, values[k], ctx)
      if (m.error) warnings.push(`Rule ${n + 1}, input ${k + 1}: ${m.error}`)
      if (!m.ok) all = false
    })
    if (all) {
      const { out, errors } = outputOf(d, rule, ctx)
      for (const e of errors) warnings.push(`Rule ${n + 1}: ${e}`)
      hits.push({ n: n + 1, out })
    }
  })
  const matched = hits.map((h) => h.n)
  const base = { matched, warnings }
  if (!hits.length) return { ...base, result: null }
  switch (d.hitPolicy) {
    case 'FIRST':
      return { ...base, result: hits[0].out }
    case 'PRIORITY':
      return { ...base, result: [...hits].sort((a, b) => priority(d, a.out) - priority(d, b.out))[0].out }
    case 'ANY': {
      const same = hits.every((h) => JSON.stringify(h.out) === JSON.stringify(hits[0].out))
      return same ? { ...base, result: hits[0].out } : { ...base, result: null, error: 'any-conflict' }
    }
    case 'RULE ORDER':
      return { ...base, result: hits.map((h) => h.out) }
    case 'OUTPUT ORDER':
      return { ...base, result: [...hits].sort((a, b) => priority(d, a.out) - priority(d, b.out)).map((h) => h.out) }
    case 'COLLECT': {
      if (!d.aggregation) return { ...base, result: hits.map((h) => h.out) }
      const key = d.outputs[0]?.name || d.outputs[0]?.label || 'output1'
      const nums = hits.map((h) => h.out[key]).filter((v) => typeof v === 'number')
      const agg = { SUM: () => nums.reduce((a, b) => a + b, 0), MIN: () => (nums.length ? Math.min(...nums) : null), MAX: () => (nums.length ? Math.max(...nums) : null), COUNT: () => hits.length }[d.aggregation]
      return { ...base, result: agg ? agg() : hits.map((h) => h.out) }
    }
    default: // UNIQUE
      return hits.length > 1 ? { ...base, result: null, error: 'unique-conflict' } : { ...base, result: hits[0].out }
  }
}

// Une valeur qui satisfait une entrée simple de règle, pour proposer un cas de test.
// undefined si l'entrée sort des formes simples (nombres, textes entre guillemets, booléens).
function sampleFor(entry, input) {
  const type = input.type || 'string'
  const parsed = parseEntry(entry, type)
  if (!parsed) return undefined
  if (parsed.any) {
    const allowed = type === 'string' ? parseEntry(input.values, 'string')?.values : null
    if (allowed?.size) return [...allowed][0]
    return type === 'number' ? 0 : type === 'boolean' ? true : ''
  }
  if (parsed.values) {
    const v = [...parsed.values][0]
    return type === 'boolean' ? v === 'true' : v
  }
  const r = parsed.ranges?.[0]
  if (!r) return undefined
  if (r.lo === r.hi) return r.lo
  if (r.lo === -Infinity) return r.hiIn ? r.hi : r.hi - 1
  if (r.hi === Infinity) return r.loIn ? r.lo : r.lo + 1
  if (r.loIn) return r.lo
  if (r.hiIn) return r.hi
  return (r.lo + r.hi) / 2
}

// Un cas de test par règle : des valeurs d'entrée qui la déclenchent, quand ses entrées sont
// simples. [{ rule, inputs: [valeurs], label }]. Les règles aux expressions plus complexes sont
// laissées de côté.
export function casesPerRule(d) {
  if (d?.kind !== 'table') return []
  const out = []
  d.rules.forEach((rule, n) => {
    const inputs = d.inputs.map((input, k) => sampleFor(rule.inputs[k], input))
    if (inputs.some((v) => v === undefined)) return
    out.push({ rule: n + 1, inputs })
  })
  return out
}
