// Table de décision ↔ tableau (Excel .xlsx, CSV), pour la fenêtre DMN.
//
// Disposition, une colonne par entrée, par sortie, puis l'annotation :
//   A1  politique (UNIQUE, FIRST, COLLECT SUM…)  | Entrée      | Sortie   | Annotation
//   A2  Libellé                                   | Montant     | Risque   |
//   A3  Expression / nom                          | montant     | risque   |
//   A4  Type                                      | number      | string   |
//   A5  Valeurs                                   |             | "faible","élevé" |
//   A6… numéro de règle                           | < 1000      | "faible" | commentaire
// Les lignes 2 à 5 sont facultatives à l'import : elles se reconnaissent au mot de la colonne A.
// Les mots sont acceptés en anglais comme en français. Ce module ne dépend pas de la page.

import { HIT_POLICIES, AGGREGATIONS, TYPES } from './dmn-model.js'

const KIND = {
  input: ['input', 'entrée', 'entree'],
  output: ['output', 'sortie'],
  annotation: ['annotation', 'annotations', 'description', 'commentaire'],
}
const META = {
  label: ['label', 'libellé', 'libelle'],
  expression: ['expression', 'expression / name', 'expression / nom', 'name', 'nom'],
  type: ['type'],
  values: ['values', 'valeurs', 'allowed values', 'valeurs permises'],
}
const norm = (s) => String(s ?? '').trim().toLowerCase()
const kindOf = (s) => Object.keys(KIND).find((k) => KIND[k].includes(norm(s))) || null
const metaOf = (s) => Object.keys(META).find((k) => META[k].includes(norm(s))) || null

// Texte FEEL simple ("a" ou "a","b") écrit sans guillemets, plus lisible dans un tableur.
// L'import les remet (quoteStrings). Le reste (not(...), virgule dans un texte…) reste tel quel.
const SIMPLE = /^"[^"\\,()<>=[\]]*"(\s*,\s*"[^"\\,()<>=[\]]*")*$/
export const plainText = (v, type) => ((type || 'string') === 'string' && SIMPLE.test(String(v ?? '').trim()) && !/^"(null|true|false|-)"$/.test(String(v).trim())
  ? String(v).trim().split(/\s*,\s*/).map((x) => x.slice(1, -1)).join(', ')
  : v)

// Lignes du tableau pour la décision `d` (résumé de summarize). fr : libellés en français.
export function tableToRows(d, fr = false) {
  if (d?.kind !== 'table') throw new Error('Only decision tables can be exported as a sheet.')
  const w = (en, f) => (fr ? f : en)
  const head = [d.hitPolicy + (d.aggregation ? ` ${d.aggregation}` : '')]
  const kinds = [...head, ...d.inputs.map(() => w('Input', 'Entrée')), ...d.outputs.map(() => w('Output', 'Sortie')), 'Annotation']
  const row = (title, ins, outs) => [title, ...d.inputs.map(ins), ...d.outputs.map(outs), '']
  const inType = (k) => d.inputs[k].type
  const outType = (k) => d.outputs[k].type
  return [
    kinds,
    row(w('Label', 'Libellé'), (i) => i.label, (o) => o.label),
    row(w('Expression / name', 'Expression / nom'), (i) => i.expression, (o) => o.name),
    row('Type', (i) => i.type || 'string', (o) => o.type || 'string'),
    row(w('Values', 'Valeurs'), (i) => plainText(i.values, i.type), (o) => plainText(o.values, o.type)),
    ...d.rules.map((r, n) => [String(n + 1), ...r.inputs.map((v, k) => plainText(v, inType(k))), ...r.outputs.map((v, k) => plainText(v, outType(k))), r.annotation || '']),
  ]
}

// Lignes lues dans un tableau → spec de setDecisionTable (sans decisionId ni name).
// Lève une erreur claire quand la disposition n'est pas reconnue.
export function rowsToSpec(rows) {
  const grid = (rows || []).map((r) => r.map((c) => String(c ?? '').trim()))
  if (!grid.length) throw new Error('The sheet is empty.')
  const first = grid[0]
  const kinds = first.map((c, k) => (k === 0 ? null : kindOf(c)))
  const cols = { input: [], output: [], annotation: -1 }
  kinds.forEach((kind, k) => {
    if (kind === 'annotation') { if (cols.annotation === -1) cols.annotation = k } else if (kind) cols[kind].push(k)
  })
  if (!cols.input.length || !cols.output.length) {
    throw new Error('Row 1 must name each column Input (Entrée), Output (Sortie) or Annotation, from column B on, with at least one input and one output.')
  }
  const [policy, aggregation] = norm(first[0]).toUpperCase().replace(/\s+/g, ' ').split(/ (?=SUM|MIN|MAX|COUNT)/)
  const meta = {}
  let start = 1
  while (start < grid.length && metaOf(grid[start][0])) { meta[metaOf(grid[start][0])] = grid[start]; start++ }
  const cell = (key, k) => meta[key]?.[k] ?? ''
  const typeOf = (key, k) => {
    const t = cell(key, k)
    if (!t) return 'string'
    const found = TYPES.find((x) => x.toLowerCase() === t.toLowerCase())
    if (!found) throw new Error(`Unknown type "${t}" in column ${colName(k)}.`)
    return found
  }
  const inputs = cols.input.map((k) => ({ label: cell('label', k), expression: cell('expression', k), type: typeOf('type', k), values: cell('values', k) || undefined }))
  const outputs = cols.output.map((k) => ({ label: cell('label', k), name: cell('expression', k), type: typeOf('type', k), values: cell('values', k) || undefined }))
  inputs.forEach((i, n) => { if (!i.label && !i.expression) i.label = `Input ${n + 1}` })
  outputs.forEach((o, n) => { if (!o.label && !o.name) o.label = `Output ${n + 1}` })
  const rules = grid.slice(start)
    .filter((r) => [...cols.input, ...cols.output].some((k) => r[k]))
    .map((r) => ({
      inputs: cols.input.map((k) => r[k] || '-'),
      outputs: cols.output.map((k) => r[k] || ''),
      annotation: cols.annotation !== -1 ? r[cols.annotation] || '' : '',
    }))
  const spec = { inputs, outputs, rules }
  if (HIT_POLICIES.includes(policy)) spec.hitPolicy = policy
  if (spec.hitPolicy === 'COLLECT' && AGGREGATIONS.includes(aggregation)) spec.aggregation = aggregation
  return spec
}

function colName(k) {
  return (k >= 26 ? colName(Math.floor(k / 26) - 1) : '') + String.fromCharCode(65 + (k % 26))
}
