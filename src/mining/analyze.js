// Analyse d'un journal sur le diagramme : passages réels, part de chaque branche des
// passerelles, durées et attentes par étape, goulets d'étranglement, variantes, conformité.
// Les cas sont rejoués par variante (même suite d'étapes) : un journal de 100 000 cas en
// compte en général quelques centaines.

import { buildNet, replaySequence } from './replay.js'
import { variantKey } from './event-log.js'

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0)
const median = (sorted) => {
  if (!sorted.length) return 0
  const h = sorted.length / 2
  return sorted.length % 2 ? sorted[Math.floor(h)] : (sorted[h - 1] + sorted[h]) / 2
}
function stats(values) {
  const s = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b)
  return s.length ? { n: s.length, median: median(s), p90: quantile(s, 0.9), mean: s.reduce((a, b) => a + b, 0) / s.length } : null
}

// mapping : { [activity]: elementId | null }.
export function analyzeLog(log, mapping, definitions, { examples = 10 } = {}) {
  const net = buildNet(definitions)
  const visible = new Set(Object.values(mapping).filter((id) => id && net.nodes.has(id)))
  const idOf = (activity) => (mapping[activity] && net.nodes.has(mapping[activity]) ? mapping[activity] : null)

  // Variantes.
  const variants = new Map()
  for (const c of log.cases) {
    const k = variantKey(c)
    if (!variants.has(k)) variants.set(k, { steps: c.events.map((e) => e.activity), cases: [] })
    variants.get(k).cases.push(c.id)
  }

  const nodes = {}
  const flows = {}
  const add = (into, from, w) => { for (const [id, n] of Object.entries(from)) into[id] = (into[id] || 0) + n * w }
  const devs = new Map()
  let fitting = 0
  let fitnessSum = 0
  for (const v of variants.values()) {
    const seq = v.steps.map((activity) => ({ id: idOf(activity), activity }))
    const r = replaySequence(net, seq, visible)
    const w = v.cases.length
    add(nodes, r.nodes, w)
    add(flows, r.flows, w)
    if (r.fits) fitting += w
    fitnessSum += r.fitness * w
    v.fits = r.fits
    // Un écart compte une fois par cas, même répété dans le cas.
    const seen = new Set()
    for (const d of r.deviations) {
      const k = [d.kind, d.element || '', d.other || '', d.activity || '', d.kind === 'outside' ? d.after || '' : ''].join('|')
      if (seen.has(k)) continue
      seen.add(k)
      if (!devs.has(k)) { const { before, ...rest } = d; devs.set(k, { ...rest, cases: 0, examples: [] }) }
      const agg = devs.get(k)
      agg.cases += w
      for (const id of v.cases) if (agg.examples.length < examples) agg.examples.push(id)
    }
  }

  // Part de chaque branche des passerelles qui se divisent.
  const branches = {}
  for (const node of net.nodes.values()) {
    if (!['xor', 'or'].includes(node.kind) || node.outgoing.length < 2) continue
    const total = node.outgoing.reduce((s, f) => s + (flows[f] || 0), 0)
    if (!total) continue
    for (const f of node.outgoing) branches[f] = { gateway: node.id, count: flows[f] || 0, share: (flows[f] || 0) / total }
  }

  // Durées (début → fin) et attentes (fin de l'étape précédente → début) par élément.
  const durations = {}
  const waits = {}
  const cycle = []
  for (const c of log.cases) {
    const ev = c.events
    cycle.push(ev[ev.length - 1].end - ev[0].start)
    for (let i = 0; i < ev.length; i++) {
      const id = idOf(ev[i].activity)
      if (!id) continue
      if (log.hasDuration) (durations[id] ||= []).push(ev[i].end - ev[i].start)
      if (i > 0) (waits[id] ||= []).push(Math.max(0, ev[i].start - ev[i - 1].end))
    }
  }
  const timing = {}
  for (const id of new Set([...Object.keys(durations), ...Object.keys(waits)])) {
    timing[id] = { duration: durations[id] ? stats(durations[id]) : null, wait: waits[id] ? stats(waits[id]) : null }
  }
  const bottlenecks = Object.entries(timing)
    .filter(([, t]) => t.wait && t.wait.median > 0)
    .sort(([, a], [, b]) => b.wait.median - a.wait.median)
    .slice(0, 3)
    .map(([id]) => id)

  // Étapes hors modèle, par nom.
  const outside = {}
  for (const c of log.cases) {
    const names = new Set(c.events.filter((e) => !idOf(e.activity)).map((e) => e.activity))
    for (const n of names) outside[n] = (outside[n] || 0) + 1
  }

  const total = log.cases.length
  return {
    source: log.name,
    cases: total,
    events: log.events,
    from: log.from,
    to: log.to,
    hasDuration: log.hasDuration,
    cycle: stats(cycle),
    nodes,
    flows,
    branches,
    timing,
    bottlenecks,
    variants: [...variants.values()]
      .sort((a, b) => b.cases.length - a.cases.length)
      .map((v) => ({ steps: v.steps, cases: v.cases.length, fits: v.fits, examples: v.cases.slice(0, examples) })),
    conformance: {
      fitting,
      total,
      fitness: total ? fitnessSum / total : 1,
      deviations: [...devs.values()].sort((a, b) => b.cases - a.cases),
    },
    outside: Object.entries(outside).map(([activity, cases]) => ({ activity, cases })).sort((a, b) => b.cases - a.cases),
    mapping: { ...mapping },
  }
}

// Résumé sans donnée de cas : ce qui peut être enregistré dans le fichier .bpmn ou envoyé
// à une IA. Ni identifiant de cas, ni ressource, ni exemple.
export function aggregateOnly(result, { variants = 10 } = {}) {
  return {
    source: result.source,
    cases: result.cases,
    events: result.events,
    from: result.from,
    to: result.to,
    hasDuration: result.hasDuration,
    cycle: result.cycle,
    nodes: result.nodes,
    flows: result.flows,
    branches: result.branches,
    timing: result.timing,
    bottlenecks: result.bottlenecks,
    variants: result.variants.slice(0, variants).map((v) => ({ steps: v.steps, cases: v.cases, fits: v.fits })),
    conformance: {
      fitting: result.conformance.fitting,
      total: result.conformance.total,
      fitness: result.conformance.fitness,
      deviations: result.conformance.deviations.map(({ examples, ...d }) => d),
    },
    outside: result.outside,
  }
}
