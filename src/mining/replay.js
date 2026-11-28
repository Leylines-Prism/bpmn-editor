// Rejeu des cas d'un journal sur le diagramme (token replay) : chaque étape associée à un
// élément le « tire » ; les passerelles et les éléments sans étape dans le journal sont
// franchis en silence, par le plus court chemin. Quand une étape arrive sans jeton pour
// elle, on note le jeton manquant et la cause probable (étape sautée, ordre inversé). Les
// jetons restés en route à la fin du cas font un cas inachevé.
//
// Le résultat donne les passages réels par élément et par flux (carte de chaleur, part de
// chaque branche des passerelles) et la conformité du cas (fitness, de 0 à 1).

const MAX_DEPTH = 12
const MAX_STATES = 4000

const is = (bo, type) => bo?.$instanceOf?.(type)

function processesOf(definitions) {
  const out = []
  for (const root of definitions?.rootElements || []) {
    if (is(root, 'bpmn:Process')) out.push(root)
  }
  return out
}

// Réseau : un nœud par élément de flux du premier niveau de chaque processus (un
// sous-processus déplié compte comme une activité), avec ses flux entrants et sortants.
export function buildNet(definitions) {
  const nodes = new Map()
  const flows = new Map()
  for (const p of processesOf(definitions)) {
    for (const el of p.flowElements || []) {
      if (is(el, 'bpmn:SequenceFlow')) flows.set(el.id, { id: el.id, source: el.sourceRef?.id, target: el.targetRef?.id })
    }
    for (const el of p.flowElements || []) {
      if (!is(el, 'bpmn:FlowNode')) continue
      const kind = is(el, 'bpmn:ParallelGateway') ? 'and'
        : is(el, 'bpmn:InclusiveGateway') ? 'or'
          : is(el, 'bpmn:Gateway') ? 'xor'
            : is(el, 'bpmn:StartEvent') ? 'start'
              : is(el, 'bpmn:EndEvent') ? 'end'
                : is(el, 'bpmn:BoundaryEvent') ? 'boundary'
                  : 'task'
      nodes.set(el.id, {
        id: el.id,
        name: el.name || '',
        kind,
        process: p.id,
        plainStart: kind === 'start' && !(el.eventDefinitions || []).length,
        host: kind === 'boundary' ? el.attachedToRef?.id : null,
        incoming: [],
        outgoing: [],
      })
    }
  }
  for (const f of flows.values()) {
    nodes.get(f.source)?.outgoing.push(f.id)
    nodes.get(f.target)?.incoming.push(f.id)
  }
  return { nodes, flows }
}

// ── Marquages : place → nombre de jetons. Places : un flux, ou « s:<id> » pour un
// événement de début pas encore déclenché, ou « e:<id> » pour une fin atteinte. ──
const key = (m) => [...m].filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, n]) => `${p}=${n}`).join(',')
const take = (m, p) => { const n = m.get(p) || 0; if (n <= 1) m.delete(p); else m.set(p, n - 1) }
const put = (m, p) => m.set(p, (m.get(p) || 0) + 1)
const has = (m, p) => (m.get(p) || 0) > 0
const flowTokens = (m) => [...m].reduce((s, [p, n]) => (p.startsWith('s:') || p.startsWith('e:') ? s : s + n), 0)

// Façons de tirer un nœud dans un marquage : [{ consume: [places], produce: [places] }].
function firings(net, node, m, fired) {
  const out = []
  const withToken = node.incoming.filter((f) => has(m, f))
  let consumes
  if (node.kind === 'start') consumes = has(m, `s:${node.id}`) ? [[`s:${node.id}`]] : []
  else if (node.kind === 'boundary') {
    // Un événement en bordure part de son activité, une fois celle-ci tirée.
    if (!fired?.has(node.host)) return out
    const host = net.nodes.get(node.host)
    const hostToken = host?.outgoing.find((f) => has(m, f))
    consumes = [hostToken ? [hostToken] : []]
  } else if (node.kind === 'and') consumes = withToken.length === node.incoming.length && node.incoming.length ? [node.incoming] : []
  else if (node.kind === 'or') consumes = withToken.length ? [withToken] : []
  else consumes = withToken.map((f) => [f])
  if (!consumes.length) return out
  let produces
  if (node.kind === 'end') produces = [[`e:${node.id}`]]
  else if (node.kind === 'xor') produces = node.outgoing.map((f) => [f])
  else if (node.kind === 'or') produces = node.outgoing.length > 1 ? [...node.outgoing.map((f) => [f]), node.outgoing] : [node.outgoing]
  else produces = [node.outgoing]
  for (const c of consumes) for (const p of produces) out.push({ consume: c, produce: p })
  return out
}

function apply(m, f) {
  const next = new Map(m)
  for (const p of f.consume) take(next, p)
  for (const p of f.produce) put(next, p)
  return next
}

// Plus court enchaînement de nœuds silencieux (et, si allowVisible, d'au plus un nœud
// visible) qui mène à un marquage où goal(m) est vrai. Renvoie { steps, m, visible } ou null.
function route(net, m, silent, goal, { allowVisible = false, fired = null } = {}) {
  if (goal(m)) return { steps: [], m, visible: null }
  const seen = new Set([`${key(m)}|`])
  let frontier = [{ m, steps: [], visible: null }]
  let states = 0
  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const next = []
    for (const s of frontier) {
      for (const node of net.nodes.values()) {
        const isSilent = silent(node.id)
        if (!isSilent && (!allowVisible || s.visible)) continue
        for (const f of firings(net, node, s.m, fired)) {
          const m2 = apply(s.m, f)
          const visible = isSilent ? s.visible : node.id
          const k = `${key(m2)}|${visible || ''}`
          if (seen.has(k)) continue
          seen.add(k)
          const s2 = { m: m2, steps: [...s.steps, { node: node.id, produce: f.produce }], visible }
          if (goal(m2)) return s2
          next.push(s2)
          if (++states > MAX_STATES) return null
        }
      }
    }
    frontier = next
  }
  return null
}

// Rejoue une suite d'éléments (ids, null pour une étape hors modèle, avec son nom).
// seq : [{ id, activity }]. Renvoie les passages, les jetons et les écarts.
export function replaySequence(net, seq, visibleIds) {
  const silent = (id) => !visibleIds.has(id)
  const nodes = {}
  const flows = {}
  const deviations = []
  const fired = new Set()
  const count = (map, id) => { map[id] = (map[id] || 0) + 1 }
  const record = (steps) => {
    for (const s of steps) {
      count(nodes, s.node)
      fired.add(s.node)
      for (const p of s.produce) if (net.flows.has(p)) count(flows, p)
    }
  }

  // Jeton de départ : l'événement de début associé à la première étape, sinon le premier
  // événement de début simple du processus de la première étape associée.
  const firstMapped = seq.find((s) => s.id && net.nodes.has(s.id))
  const process = firstMapped ? net.nodes.get(firstMapped.id).process : null
  const starts = [...net.nodes.values()].filter((n) => n.kind === 'start' && (!process || n.process === process))
  const start = (firstMapped && net.nodes.get(firstMapped.id).kind === 'start' ? net.nodes.get(firstMapped.id) : null)
    || starts.find((n) => n.plainStart) || starts[0]
  let m = new Map()
  let produced = 0
  let consumed = 0
  let missing = 0
  if (start) { put(m, `s:${start.id}`); produced++ }

  let previous = null
  for (let i = 0; i < seq.length; i++) {
    const step = seq[i]
    const node = step.id ? net.nodes.get(step.id) : null
    if (!node) {
      deviations.push({ kind: 'outside', activity: step.activity, after: previous })
      continue
    }
    const canFire = (mm) => firings(net, node, mm, fired).length > 0
    let r = route(net, m, silent, canFire, { fired })
    if (!r) {
      // Pas de chemin : on cherche l'étape qui manque, puis on force le jeton.
      const via = route(net, m, silent, canFire, { allowVisible: true, fired })
      if (via?.visible) {
        const later = seq.slice(i + 1).some((s) => s.id === via.visible)
        deviations.push(later ? { kind: 'order', element: node.id, other: via.visible } : { kind: 'skipped', element: via.visible, before: node.id })
      } else deviations.push({ kind: 'unexpected', element: node.id, after: previous })
      const lack = node.kind === 'start' ? [`s:${node.id}`]
        : node.kind === 'and' ? node.incoming.filter((f) => !has(m, f))
          : node.kind === 'boundary' ? [] : node.incoming.length ? [node.incoming[0]] : []
      const boundaryHost = node.kind === 'boundary' && !fired.has(node.host)
      if (boundaryHost) fired.add(node.host)
      for (const p of lack) put(m, p)
      missing += lack.length || (boundaryHost ? 1 : 0)
      r = route(net, m, silent, canFire, { fired }) || { steps: [], m }
    }
    record(r.steps)
    consumed += r.steps.length // approximation : un jeton par nœud franchi
    produced += r.steps.length
    m = r.m
    const f = firings(net, node, m, fired)[0]
    if (f) {
      m = apply(m, f)
      consumed += f.consume.length
      produced += f.produce.length
      record([{ node: node.id, produce: f.produce }])
    } else {
      count(nodes, node.id)
      fired.add(node.id)
    }
    previous = node.id
  }

  // Fin du cas : on mène les jetons restants vers les fins, en silence.
  // Sinon (un jeton reste bloqué derrière une étape non faite), on mène au moins les autres
  // jusqu'à une fin.
  const before = flowTokens(m)
  const ended = (mm) => [...mm.keys()].some((p) => p.startsWith('e:'))
  const end = route(net, m, silent, (mm) => flowTokens(mm) === 0, { fired })
    || route(net, m, silent, (mm) => ended(mm) && flowTokens(mm) < before, { fired })
  if (end) {
    record(end.steps)
    m = end.m
  }
  let remaining = flowTokens(m)
  const reachedEnd = ended(m)
  if (start && has(m, `s:${start.id}`)) remaining++
  // Jetons restés en route après un jeton forcé : conséquence de l'écart déjà noté.
  if (!reachedEnd || (remaining > 0 && !missing)) deviations.push({ kind: 'unfinished', element: previous })
  consumed += [...m].filter(([p]) => p.startsWith('e:')).reduce((s, [, n]) => s + n, 0)
  produced = Math.max(produced, 1)
  consumed = Math.max(consumed, 1)
  const fitness = Math.max(0, Math.min(1, 0.5 * (1 - missing / consumed) + 0.5 * (1 - remaining / produced)))
  return { nodes, flows, missing, remaining, fitness, deviations, fits: deviations.length === 0 }
}
