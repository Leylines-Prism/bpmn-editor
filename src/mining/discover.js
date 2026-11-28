// Dessin d'un processus à partir d'un journal (process discovery), sans IA : graphe des
// successions (directly-follows graph, qui suit qui et combien de fois), filtré, puis
// traduit en BPMN avec des passerelles exclusives là où le flux se divise ou se rejoint.
// Un premier jet à relire : le parallélisme n'est pas reconnu par ce calcul, le Co-pilote IA
// sait le faire à partir du même graphe.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// traces : [[activité, …], …] (une par cas).
export function directlyFollows(traces) {
  const activities = new Map()
  const edges = new Map()
  const starts = new Map()
  const ends = new Map()
  const inc = (map, k, n = 1) => map.set(k, (map.get(k) || 0) + n)
  for (const t of traces) {
    if (!t.length) continue
    inc(starts, t[0])
    inc(ends, t[t.length - 1])
    t.forEach((a, i) => {
      inc(activities, a)
      if (i) inc(edges, `${t[i - 1]}\u0000${a}`)
    })
  }
  return {
    traces: traces.length,
    activities: [...activities].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    edges: [...edges].map(([k, count]) => { const [from, to] = k.split('\u0000'); return { from, to, count } }).sort((a, b) => b.count - a.count),
    starts: [...starts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    ends: [...ends].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  }
}

// Garde les étapes les plus fréquentes (part des événements, de 0 à 1), puis les chemins
// les plus fréquents (part des passages). Chaque étape gardée reste reliée.
export function filterGraph(traces, { activities = 1, paths = 0.8 } = {}) {
  const full = directlyFollows(traces)
  const total = full.activities.reduce((s, a) => s + a.count, 0)
  const keep = new Set()
  let cum = 0
  for (const a of full.activities) {
    if (keep.size && cum / total >= activities) break
    keep.add(a.name)
    cum += a.count
  }
  const projected = traces.map((t) => t.filter((a) => keep.has(a))).filter((t) => t.length)
  const g = directlyFollows(projected)
  const edgeTotal = g.edges.reduce((s, e) => s + e.count, 0) + g.starts.reduce((s, e) => s + e.count, 0) + g.ends.reduce((s, e) => s + e.count, 0)
  const all = [
    ...g.starts.map((e) => ({ from: null, to: e.name, count: e.count })),
    ...g.edges,
    ...g.ends.map((e) => ({ from: e.name, to: null, count: e.count })),
  ].sort((a, b) => b.count - a.count)
  const kept = []
  let sum = 0
  for (const e of all) {
    if (kept.length && sum / edgeTotal >= paths) break
    kept.push(e)
    sum += e.count
  }
  // Chaque étape garde au moins son entrée et sa sortie les plus fréquentes.
  for (const a of g.activities) {
    for (const side of ['to', 'from']) {
      if (kept.some((e) => e[side] === a.name)) continue
      const best = all.find((e) => e[side] === a.name)
      if (best) kept.push(best)
    }
  }
  return {
    traces: g.traces,
    activities: g.activities,
    edges: kept.filter((e) => e.from && e.to),
    starts: kept.filter((e) => !e.from).map((e) => ({ name: e.to, count: e.count })),
    ends: kept.filter((e) => !e.to).map((e) => ({ name: e.from, count: e.count })),
    hidden: { activities: full.activities.length - g.activities.length, paths: all.length - kept.length },
  }
}

// XML BPMN sans disposition (bpmn-auto-layout la calcule ensuite). Les flux sortants des
// passerelles portent la part observée, en probabilité (bpmnpilot:probability).
export function graphToBpmn(g, { processName = '', startName = '', endName = '' } = {}) {
  const ids = new Map(g.activities.map((a, i) => [a.name, `Activity_${i + 1}`]))
  const elements = []
  const flows = []
  let n = 0
  const flowId = () => `Flow_${++n}`
  const flow = (source, target, probability) => {
    const id = flowId()
    flows.push({ id, source, target, probability })
    return id
  }
  elements.push(`<bpmn:startEvent id="StartEvent_1"${startName ? ` name="${esc(startName)}"` : ''} />`)
  elements.push(`<bpmn:endEvent id="EndEvent_1"${endName ? ` name="${esc(endName)}"` : ''} />`)
  // Entrée de chaque étape : directe, ou par une passerelle de jonction.
  const sources = new Map()
  const targets = new Map()
  for (const a of g.activities) { sources.set(a.name, []); targets.set(a.name, []) }
  const startOuts = g.starts.filter((s) => ids.has(s.name))
  const endIns = g.ends.filter((s) => ids.has(s.name))
  for (const s of startOuts) sources.get(s.name).push({ from: 'StartEvent_1', count: s.count })
  for (const e of g.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue
    targets.get(e.from).push({ to: e.to, count: e.count })
    sources.get(e.to).push({ from: e.from, count: e.count })
  }
  for (const e of endIns) targets.get(e.name).push({ to: null, count: e.count })

  const entry = new Map()
  for (const a of g.activities) {
    const id = ids.get(a.name)
    elements.push(`<bpmn:task id="${id}" name="${esc(a.name)}" />`)
    if (sources.get(a.name).length > 1) {
      const join = `Gateway_join_${id}`
      elements.push(`<bpmn:exclusiveGateway id="${join}" />`)
      flow(join, id)
      entry.set(a.name, join)
    } else entry.set(a.name, id)
  }
  let endEntry = 'EndEvent_1'
  if (endIns.length > 1) {
    endEntry = 'Gateway_join_end'
    elements.push(`<bpmn:exclusiveGateway id="${endEntry}" />`)
    flow(endEntry, 'EndEvent_1')
  }
  const target = (name) => (name === null ? endEntry : entry.get(name))
  // Sortie de l'événement de début.
  if (startOuts.length > 1) {
    elements.push('<bpmn:exclusiveGateway id="Gateway_split_start" />')
    flow('StartEvent_1', 'Gateway_split_start')
    const total = startOuts.reduce((s, o) => s + o.count, 0)
    for (const o of startOuts) flow('Gateway_split_start', target(o.name), Math.round((o.count / total) * 100))
  } else if (startOuts.length) flow('StartEvent_1', target(startOuts[0].name))
  // Sortie de chaque étape.
  for (const a of g.activities) {
    const id = ids.get(a.name)
    const outs = targets.get(a.name)
    if (outs.length > 1) {
      const split = `Gateway_split_${id}`
      elements.push(`<bpmn:exclusiveGateway id="${split}" />`)
      flow(id, split)
      const total = outs.reduce((s, o) => s + o.count, 0)
      for (const o of outs) flow(split, target(o.to), Math.round((o.count / total) * 100))
    } else if (outs.length) flow(id, target(outs[0].to))
  }
  // Les flux reliés aux passerelles de jonction sont déjà là ; ceux qui visent une étape
  // à entrée unique aussi. On écrit tout, incoming et outgoing compris.
  const inc = new Map()
  const out = new Map()
  for (const f of flows) {
    if (!out.has(f.source)) out.set(f.source, [])
    if (!inc.has(f.target)) inc.set(f.target, [])
    out.get(f.source).push(f.id)
    inc.get(f.target).push(f.id)
  }
  const withRefs = elements.map((xml) => {
    const id = /id="([^"]+)"/.exec(xml)[1]
    const refs = [...(inc.get(id) || []).map((f) => `<bpmn:incoming>${f}</bpmn:incoming>`), ...(out.get(id) || []).map((f) => `<bpmn:outgoing>${f}</bpmn:outgoing>`)].join('')
    return refs ? xml.replace(/ \/>$/, `>${refs}</${/^<([\w:]+)/.exec(xml)[1]}>`) : xml
  })
  const flowXml = flows.map((f) => `<bpmn:sequenceFlow id="${f.id}" sourceRef="${f.source}" targetRef="${f.target}"${f.probability !== undefined ? ` bpmnpilot:probability="${f.probability}"` : ''} />`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmnpilot="https://bpmn.leylines.fr/schema/bpmn-pilot/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"${processName ? ` name="${esc(processName)}"` : ''} isExecutable="false">
    ${[...withRefs, ...flowXml].join('\n    ')}
  </bpmn:process>
</bpmn:definitions>`
}
