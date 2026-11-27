// Différences entre deux versions d'un modèle de décision, pour la comparaison de la fenêtre DMN.
// Entrée : deux résumés de summarize() (dmn-model.js). Les décisions, colonnes et règles sont
// appariées par identifiant (dmn-js les garde à l'édition) puis, pour les règles restantes,
// par contenu. Ce module ne dépend pas de la page : il tourne aussi dans les tests.

const cells = (r) => [...r.inputs, '→', ...r.outputs].join(' | ')
const label = (d) => d.name || d.id
const colName = (c) => c.label || c.name || c.expression || c.id

function diffColumns(kind, before, after, out, decision) {
  const fr = kind === 'input' ? 'entrée' : 'sortie'
  // Appariement par identifiant, puis par nom pour les colonnes recréées (import d'un tableau).
  const pair = new Map()
  for (const c of after) { const o = before.find((b) => b.id === c.id); if (o) pair.set(c, o) }
  const used = new Set(pair.values())
  for (const c of after) {
    if (pair.has(c)) continue
    const o = before.find((b) => !used.has(b) && colName(b) === colName(c))
    if (o) { pair.set(c, o); used.add(o) }
  }
  for (const c of after) {
    const old = pair.get(c)
    if (!old) { out.push({ change: 'added', decision, text: `${kind === 'input' ? 'Input' : 'Output'} "${colName(c)}" added.`, fr: `${fr[0].toUpperCase() + fr.slice(1)} « ${colName(c)} » ajoutée.` }); continue }
    for (const key of ['label', 'name', 'expression', 'type', 'values']) {
      if ((old[key] || '') !== (c[key] || '')) {
        out.push({ change: 'changed', decision, text: `${kind === 'input' ? 'Input' : 'Output'} "${colName(c)}": ${key} ${JSON.stringify(old[key] || '')} → ${JSON.stringify(c[key] || '')}.`, fr: `${fr[0].toUpperCase() + fr.slice(1)} « ${colName(c)} » : ${key} ${JSON.stringify(old[key] || '')} → ${JSON.stringify(c[key] || '')}.` })
      }
    }
  }
  for (const c of before) if (!used.has(c)) out.push({ change: 'removed', decision, text: `${kind === 'input' ? 'Input' : 'Output'} "${colName(c)}" removed.`, fr: `${fr[0].toUpperCase() + fr.slice(1)} « ${colName(c)} » retirée.` })
}

function diffRules(od, nd, out, decision) {
  const before = od.rules
  const after = nd.rules
  const col = (list, k, fallback) => (list[k] ? colName(list[k]) : fallback)
  const pairs = [] // [oldIndex, newIndex]
  const usedOld = new Set()
  const usedNew = new Set()
  after.forEach((r, j) => {
    const i = before.findIndex((o) => o.id === r.id)
    if (i !== -1) { pairs.push([i, j]); usedOld.add(i); usedNew.add(j) }
  })
  // Règles sans identifiant commun (fichier importé, ids renommés) : appariées si identiques.
  after.forEach((r, j) => {
    if (usedNew.has(j)) return
    const i = before.findIndex((o, k) => !usedOld.has(k) && cells(o) === cells(r))
    if (i !== -1) { pairs.push([i, j]); usedOld.add(i); usedNew.add(j) }
  })
  const rules = { added: [], removed: [], changed: [] } // n° de règle dans la nouvelle version (removed : dans l'ancienne)
  for (const [i, j] of pairs) {
    const o = before[i]
    const r = after[j]
    const diffs = []
    r.inputs.forEach((v, k) => { if ((o.inputs[k] ?? '') !== v) diffs.push(`${col(nd.inputs, k, `#${k + 1}`)}: ${o.inputs[k] || '∅'} → ${v || '∅'}`) })
    r.outputs.forEach((v, k) => { if ((o.outputs[k] ?? '') !== v) diffs.push(`${col(nd.outputs, k, `→${k + 1}`)}: ${o.outputs[k] || '∅'} → ${v || '∅'}`) })
    if ((o.annotation || '') !== (r.annotation || '')) diffs.push(`annotation "${o.annotation || ''}" → "${r.annotation || ''}"`)
    if (diffs.length) {
      rules.changed.push(j + 1)
      out.push({ change: 'changed', decision, rule: j + 1, text: `Rule ${j + 1}${i !== j ? ` (was ${i + 1})` : ''}: ${diffs.join('; ')}.`, fr: `Règle ${j + 1}${i !== j ? ` (avant ${i + 1})` : ''} : ${diffs.map((x) => x.replace(/^([^:]+):/, '$1 :')).join(' ; ')}.` })
    } else if (i !== j) {
      out.push({ change: 'moved', decision, rule: j + 1, text: `Rule ${i + 1} moved to position ${j + 1}.`, fr: `Règle ${i + 1} déplacée en position ${j + 1}.` })
    }
  }
  after.forEach((r, j) => {
    if (usedNew.has(j)) return
    rules.added.push(j + 1)
    out.push({ change: 'added', decision, rule: j + 1, text: `Rule ${j + 1} added: ${cells(r)}.`, fr: `Règle ${j + 1} ajoutée : ${cells(r)}.` })
  })
  before.forEach((o, i) => {
    if (usedOld.has(i)) return
    rules.removed.push(i + 1)
    out.push({ change: 'removed', decision, text: `Rule ${i + 1} removed: ${cells(o)}.`, fr: `Règle ${i + 1} retirée : ${cells(o)}.` })
  })
  return rules
}

// { changes: [{ change: 'added'|'removed'|'changed'|'moved', decision, rule?, text, fr }],
//   rules: { [decisionId]: { added: [n°], changed: [n°], removed: [n°] } } }
export function diffModels(before, after) {
  const changes = []
  const rules = {}
  const old = new Map((before?.decisions || []).map((d) => [d.id, d]))
  // Une décision renommée à l'import (id_2) se rapproche de son original par le nom.
  const findOld = (d) => old.get(d.id) || [...old.values()].find((o) => o.name && o.name === d.name && !(after.decisions || []).some((a) => a.id === o.id))
  const matched = new Set()
  for (const d of after?.decisions || []) {
    const o = findOld(d)
    if (!o) { changes.push({ change: 'added', decision: d.id, text: `Decision "${label(d)}" added.`, fr: `Décision « ${label(d)} » ajoutée.` }); continue }
    matched.add(o.id)
    if (label(o) !== label(d)) changes.push({ change: 'changed', decision: d.id, text: `Decision renamed: "${label(o)}" → "${label(d)}".`, fr: `Décision renommée : « ${label(o)} » → « ${label(d)} ».` })
    if (o.kind !== d.kind) { changes.push({ change: 'changed', decision: d.id, text: `Decision "${label(d)}": logic ${o.kind} → ${d.kind}.`, fr: `Décision « ${label(d)} » : logique ${o.kind} → ${d.kind}.` }); continue }
    if (d.kind === 'literal' && o.expression !== d.expression) changes.push({ change: 'changed', decision: d.id, text: `Decision "${label(d)}": expression changed.`, fr: `Décision « ${label(d)} » : expression modifiée.` })
    if (d.kind !== 'table') continue
    if (o.hitPolicy !== d.hitPolicy || (o.aggregation || '') !== (d.aggregation || '')) {
      const hp = (x) => x.hitPolicy + (x.aggregation ? ` ${x.aggregation}` : '')
      changes.push({ change: 'changed', decision: d.id, text: `Decision "${label(d)}": hit policy ${hp(o)} → ${hp(d)}.`, fr: `Décision « ${label(d)} » : politique ${hp(o)} → ${hp(d)}.` })
    }
    diffColumns('input', o.inputs, d.inputs, changes, d.id)
    diffColumns('output', o.outputs, d.outputs, changes, d.id)
    rules[d.id] = diffRules(o, d, changes, d.id)
  }
  for (const o of before?.decisions || []) if (!matched.has(o.id)) changes.push({ change: 'removed', decision: o.id, text: `Decision "${label(o)}" removed.`, fr: `Décision « ${label(o)} » retirée.` })
  return { changes, rules }
}
