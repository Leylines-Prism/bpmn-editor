// Journal d'événements (event log) : des cas (une commande, un dossier, un ticket), chacun
// fait d'une suite d'événements datés (étape, début, fin, ressource). Construit depuis un
// tableau CSV et l'association de ses colonnes, ou depuis un fichier XES (IEEE 1849).

import { parseTimestamp, detectDayOrder } from './dates.js'

// columns : { case, activity, start, end, resource }, index de colonne ou -1.
// Il faut au moins le cas, l'étape et une date (début ou fin).
export function buildLog(table, columns, { name = '' } = {}) {
  const { rows } = table
  const col = (key) => (Number.isInteger(columns[key]) && columns[key] >= 0 ? columns[key] : -1)
  const c = { case: col('case'), activity: col('activity'), start: col('start'), end: col('end'), resource: col('resource') }
  if (c.case < 0 || c.activity < 0 || (c.start < 0 && c.end < 0)) throw new Error('columns')
  const order = (i) => (i < 0 ? 'dmy' : detectDayOrder(rows.slice(0, 500).map((r) => r[i])))
  const startOrder = order(c.start)
  const endOrder = order(c.end)
  const records = []
  let skipped = 0
  for (const r of rows) {
    const id = r[c.case]
    const activity = r[c.activity]
    const s = c.start >= 0 ? parseTimestamp(r[c.start], startOrder) : null
    const e = c.end >= 0 ? parseTimestamp(r[c.end], endOrder) : null
    if (!id || !activity || (s === null && e === null)) { skipped++; continue }
    records.push({ case: id, activity, start: s ?? e, end: e ?? s, resource: c.resource >= 0 ? r[c.resource] : '' })
  }
  return fromRecords(records, { name, skipped, hasDuration: c.start >= 0 && c.end >= 0 })
}

// Regroupe les événements par cas, triés par date de début (puis de fin, puis ordre du fichier).
export function fromRecords(records, { name = '', skipped = 0, hasDuration = false } = {}) {
  const byCase = new Map()
  records.forEach((r, i) => {
    if (!byCase.has(r.case)) byCase.set(r.case, [])
    byCase.get(r.case).push({ ...r, i })
  })
  const cases = []
  const counts = new Map()
  let from = Infinity
  let to = -Infinity
  for (const [id, events] of byCase) {
    events.sort((a, b) => a.start - b.start || a.end - b.end || a.i - b.i)
    cases.push({
      id,
      events: events.map(({ activity, start, end, resource }) => {
        counts.set(activity, (counts.get(activity) || 0) + 1)
        if (start < from) from = start
        if (end > to) to = end
        return { activity, start, end, resource }
      }),
    })
  }
  if (!cases.length) throw new Error('empty')
  return {
    name,
    cases,
    events: records.length,
    skipped,
    hasDuration: hasDuration || records.some((r) => r.end > r.start),
    from,
    to,
    activities: [...counts].map(([activity, count]) => ({ activity, count })).sort((a, b) => b.count - a.count),
  }
}

// XES : chaque <trace> est un cas, chaque <event> un événement. Les paires
// lifecycle:transition start / complete d'une même étape donnent son début et sa fin.
// parser : un DOMParser (celui de la page, ou un autre dans les tests). Renvoie
// { records, skipped } pour fromRecords.
export function parseXes(text, parser) {
  const doc = parser.parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('xml')
  const attr = (node, key) => {
    for (const child of node.children) if (child.getAttribute('key') === key) return child.getAttribute('value')
    return null
  }
  const traces = doc.getElementsByTagName('trace')
  if (!traces.length) throw new Error('empty')
  const records = []
  let skipped = 0
  let n = 0
  for (const trace of traces) {
    const id = attr(trace, 'concept:name') || `#${++n}`
    const open = new Map()
    for (const event of trace.getElementsByTagName('event')) {
      const activity = attr(event, 'concept:name')
      const time = parseTimestamp(attr(event, 'time:timestamp'))
      const transition = (attr(event, 'lifecycle:transition') || 'complete').toLowerCase()
      const resource = attr(event, 'org:resource') || ''
      if (!activity || time === null) { skipped++; continue }
      if (transition === 'start') {
        if (!open.has(activity)) open.set(activity, [])
        open.get(activity).push({ time, resource })
      } else if (transition === 'complete') {
        const begun = open.get(activity)?.shift()
        records.push({ case: id, activity, start: begun ? begun.time : time, end: time, resource: resource || begun?.resource || '' })
      }
    }
    // Étapes commencées et jamais terminées : gardées, à leur date de début.
    for (const [activity, list] of open) for (const b of list) records.push({ case: id, activity, start: b.time, end: b.time, resource: b.resource })
  }
  return { records, skipped }
}

// Suite des étapes d'un cas, en texte : la clé d'une variante.
export const variantKey = (c) => c.events.map((e) => e.activity).join('␞')
