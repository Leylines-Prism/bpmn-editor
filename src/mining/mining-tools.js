// Outils de process mining pour l'IA (serveur MCP et Co-pilote) : charger un journal,
// en lire le résumé, associer ses étapes au diagramme, appliquer les fréquences réelles,
// vérifier la conformité. Ils ne renvoient que des totaux : jamais d'identifiant de cas
// ni de ressource, qui restent dans l'éditeur.

import { filterGraph } from './discover.js'
import { variantKey } from './event-log.js'

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null)
const minutes = (ms) => (Number.isFinite(ms) ? Math.round(ms / 6000) / 10 : null)
const pct = (x) => Math.round(x * 1000) / 10

export function miningTools(api) {
  if (!api) return {}
  const need = () => {
    if (!api.hasLog()) throw new Error('No event log loaded. Call load_event_log first.')
    return api.log()
  }
  const steps = (log, mapping) => log.activities.map((a) => ({
    step: a.activity,
    rows: a.count,
    element: mapping[a.activity] || null,
    elementName: mapping[a.activity] ? api.nameOf(mapping[a.activity]) : null,
  }))

  return {
    load_event_log({ content, name, format, columns }) {
      const { log, mapping, columns: cols } = api.load({ content, name, format, columns })
      return {
        name: log.name,
        cases: log.cases.length,
        events: log.events,
        ignoredRows: log.skipped,
        from: iso(log.from),
        to: iso(log.to),
        hasDuration: log.hasDuration,
        ...(cols ? { columns: cols } : {}),
        steps: steps(log, mapping),
        unmatched: Object.entries(mapping).filter(([, id]) => !id).map(([s]) => s),
      }
    },

    get_log_summary({ activities = 1, paths = 0.9 } = {}) {
      const log = need()
      const traces = log.cases.map((c) => c.events.map((e) => e.activity))
      const g = filterGraph(traces, { activities, paths })
      // Attente médiane entre deux étapes qui se suivent.
      const waits = new Map()
      for (const c of log.cases) {
        for (let i = 1; i < c.events.length; i++) {
          const k = `${c.events[i - 1].activity}\u0000${c.events[i].activity}`
          if (!waits.has(k)) waits.set(k, [])
          waits.get(k).push(Math.max(0, c.events[i].start - c.events[i - 1].end))
        }
      }
      const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
      const variants = new Map()
      for (const c of log.cases) {
        const k = variantKey(c)
        if (!variants.has(k)) variants.set(k, { steps: c.events.map((e) => e.activity), cases: 0 })
        variants.get(k).cases++
      }
      const cycle = log.cases.map((c) => c.events[c.events.length - 1].end - c.events[0].start)
      return {
        name: log.name,
        cases: log.cases.length,
        events: log.events,
        from: iso(log.from),
        to: iso(log.to),
        medianCaseMinutes: minutes(median(cycle)),
        steps: g.activities.map((a) => ({ step: a.name, passes: a.count })),
        startsWith: g.starts.map((s) => ({ step: s.name, cases: s.count })),
        endsWith: g.ends.map((s) => ({ step: s.name, cases: s.count })),
        follows: g.edges.map((e) => ({ from: e.from, to: e.to, passes: e.count, medianWaitMinutes: minutes(median(waits.get(`${e.from}\u0000${e.to}`) || [0])) })),
        hidden: g.hidden,
        variants: [...variants.values()].sort((a, b) => b.cases - a.cases).slice(0, 10),
        variantCount: variants.size,
      }
    },

    map_log_activities({ mapping }) {
      const log = need()
      const next = api.setMapping(mapping)
      return { steps: steps(log, next) }
    },

    apply_log_frequencies() {
      need()
      const updated = api.applyProbabilities()
      const r = api.analyze('passes')
      return {
        cases: r.cases,
        branchesUpdated: updated,
        passes: Object.entries(r.nodes).map(([id, count]) => ({ element: id, name: api.nameOf(id), passes: count, shareOfCases: pct(count / r.cases) })).sort((a, b) => b.passes - a.passes),
        branches: Object.entries(r.branches).map(([flow, b]) => ({ gateway: b.gateway, gatewayName: api.nameOf(b.gateway), flow, passes: b.count, sharePercent: pct(b.share) })),
        timing: Object.entries(r.timing).map(([id, t]) => ({
          element: id,
          name: api.nameOf(id),
          medianWaitMinutes: minutes(t.wait?.median),
          p90WaitMinutes: minutes(t.wait?.p90),
          medianDurationMinutes: r.hasDuration ? minutes(t.duration?.median) : null,
        })),
        bottlenecks: r.bottlenecks.map((id) => ({ element: id, name: api.nameOf(id) })),
        medianCaseMinutes: minutes(r.cycle?.median),
      }
    },

    check_conformance() {
      need()
      const r = api.analyze('deviations')
      const c = r.conformance
      return {
        cases: c.total,
        casesFollowingTheDiagram: c.fitting,
        sharePercent: pct(c.total ? c.fitting / c.total : 1),
        fitness: Math.round(c.fitness * 1000) / 1000,
        deviations: c.deviations.map((d) => ({
          kind: d.kind,
          description: api.deviationText(d),
          ...(d.element ? { element: d.element } : {}),
          ...(d.other ? { other: d.other } : {}),
          ...(d.activity ? { step: d.activity } : {}),
          ...(d.after ? { after: d.after } : {}),
          cases: d.cases,
        })),
        stepsNotInDiagram: r.outside,
        deviatingVariants: r.variants.filter((v) => !v.fits).slice(0, 10).map((v) => ({ steps: v.steps, cases: v.cases })),
      }
    },
  }
}
