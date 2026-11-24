// Après la mise en page automatique, plusieurs flux de messages peuvent
// emprunter la même voie (même couloir entre deux pools, même colonne) et se
// superposer. On décale les segments intérieurs des flux de messages qui se
// recouvrent sur une voie libre voisine, sans toucher aux points d'accroche
// sur les formes. Les flux qui partagent une source ou une cible peuvent se
// rejoindre : ils ne sont pas séparés.

const STEP = 10 // écart entre deux voies voisines
const MAX_SHIFT = 6 // voies essayées de chaque côté
const MIN_OVERLAP = 8 // recouvrement toléré, en pixels

const horizontal = (p, q) => Math.abs(p.y - q.y) < 1 && Math.abs(p.x - q.x) >= 1
const vertical = (p, q) => Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) >= 1

function overlap1d(a0, a1, b0, b1) {
  return Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1))
}

function segmentsOverlap(p, q, r, s) {
  if (horizontal(p, q) && horizontal(r, s) && Math.abs(p.y - r.y) < 1) return overlap1d(p.x, q.x, r.x, s.x) > MIN_OVERLAP
  if (vertical(p, q) && vertical(r, s) && Math.abs(p.x - r.x) < 1) return overlap1d(p.y, q.y, r.y, s.y) > MIN_OVERLAP
  return false
}

// Le segment [p, q] passe-t-il dans le rectangle (marge de 2 px) ?
function segmentHitsRect(p, q, r) {
  const m = 2
  const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y)
  return x0 < r.x + r.width - m && x1 > r.x + m && y0 < r.y + r.height - m && y1 > r.y + m
}

// Retire les points intermédiaires alignés avec leurs voisins (deux segments
// dans le prolongement l'un de l'autre), pour que chaque segment soit une voie entière.
function simplify(points) {
  const out = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1], b = points[i], c = points[i + 1]
    const aligned = (Math.abs(a.x - b.x) < 1 && Math.abs(b.x - c.x) < 1) || (Math.abs(a.y - b.y) < 1 && Math.abs(b.y - c.y) < 1)
    if (!aligned) out.push(b)
  }
  out.push(points[points.length - 1])
  return out
}

const sharesEnd = (a, b) => a.source === b.source || a.target === b.target

// edges : [{ id, source, target, movable, points: [{x, y}] }]
// shapes : [{ id, x, y, width, height }] que les lignes ne doivent pas traverser
// Modifie les points des flux déplaçables et renvoie les identifiants modifiés.
export function separateOverlappingFlows(edges, shapes) {
  const changed = new Set()

  const conflicts = (edge, i, pts) => {
    const p = pts[i], q = pts[i + 1]
    for (const other of edges) {
      if (other === edge || sharesEnd(edge, other)) continue
      const o = other.points
      for (let k = 0; k < o.length - 1; k++) if (segmentsOverlap(p, q, o[k], o[k + 1])) return true
    }
    return false
  }

  const blocked = (edge, pts, from, to) => {
    for (const s of shapes) {
      if (s.id === edge.source || s.id === edge.target) continue
      for (let k = from; k < to; k++) if (segmentHitsRect(pts[k], pts[k + 1], s)) return true
    }
    return false
  }

  // Essaie de placer le segment i du flux sur une voie voisine libre.
  const shift = (edge, i) => {
    const pts = edge.points
    const isH = horizontal(pts[i], pts[i + 1])
    const key = isH ? 'y' : 'x'
    const base = pts[i][key]
    for (let n = 1; n <= MAX_SHIFT; n++) {
      for (const sign of [1, -1]) {
        const trial = pts.map((p) => ({ x: p.x, y: p.y }))
        trial[i][key] = trial[i + 1][key] = base + sign * n * STEP
        if (conflicts(edge, i, trial)) continue
        // Le segment déplacé et ses deux voisins, qui s'allongent ou raccourcissent.
        if (blocked(edge, trial, i - 1, i + 2)) continue
        edge.points = trial
        return true
      }
    }
    return false
  }

  // Le dernier segment tient à la cible. Quand il arrive par le côté et recouvre
  // un flux qui en part (flux de séquence sortant de l'événement, en général),
  // on fait arriver le flux de messages par le haut ou par le bas de la cible.
  const byId = new Map(shapes.map((s) => [s.id, s]))
  const rerouteEnd = (edge) => {
    const pts = edge.points
    const n = pts.length
    const t = byId.get(edge.target)
    if (!t || n < 3 || !horizontal(pts[n - 2], pts[n - 1]) || !vertical(pts[n - 3], pts[n - 2])) return false
    if (!conflicts(edge, n - 2, pts)) return false
    const cx = t.x + t.width / 2
    const column = pts[n - 3]
    const fromBelow = column.y > t.y + t.height / 2
    const near = fromBelow ? t.y + t.height : t.y
    const far = fromBelow ? t.y : t.y + t.height
    const gap = 20
    const head = pts.slice(0, n - 2)
    const tails = [
      // Dans le prolongement de la colonne, en entrant par le côté le plus proche.
      [{ x: column.x, y: fromBelow ? near + gap : near - gap }, { x: cx, y: fromBelow ? near + gap : near - gap }, { x: cx, y: near }],
      // En contournant la cible pour entrer par le côté opposé.
      [{ x: column.x, y: fromBelow ? far - gap : far + gap }, { x: cx, y: fromBelow ? far - gap : far + gap }, { x: cx, y: far }],
    ]
    for (const tail of tails) {
      const trial = [...head.map((p) => ({ x: p.x, y: p.y })), ...tail]
      const from = head.length - 2
      if (blocked(edge, trial, from, trial.length - 1)) continue
      let clash = false
      for (let k = from; k < trial.length - 1; k++) if (conflicts(edge, k, trial)) clash = true
      if (clash) continue
      edge.points = simplify(trial)
      return true
    }
    return false
  }

  // Un décalage peut mettre un segment voisin en conflit : il est traité au
  // segment suivant ou au passage suivant.
  for (let pass = 0; pass < 3; pass++) for (const edge of edges) {
    if (!edge.movable) continue
    const original = edge.points
    edge.points = simplify(original)
    if (rerouteEnd(edge)) changed.add(edge.id)
    const pts = edge.points
    // Seuls les segments intérieurs bougent : le premier et le dernier tiennent aux formes.
    for (let i = 1; i < pts.length - 2; i++) {
      const p = edge.points[i], q = edge.points[i + 1]
      if (!horizontal(p, q) && !vertical(p, q)) continue
      // Les deux voisins doivent être perpendiculaires pour rester droits une fois le segment décalé.
      const before = edge.points[i - 1], after = edge.points[i + 2]
      const perpendicular = horizontal(p, q) ? vertical(before, p) && vertical(q, after) : horizontal(before, p) && horizontal(q, after)
      if (!perpendicular) continue
      if (!conflicts(edge, i, edge.points)) continue
      if (shift(edge, i)) changed.add(edge.id)
    }
    if (!changed.has(edge.id)) edge.points = original
  }
  return [...changed]
}

// Applique la séparation au diagramme ouvert, sans passer par l'historique
// (comme le reste du rangement, qui recharge le diagramme).
export function separateMessageFlows(modeler) {
  const registry = modeler.get('elementRegistry')
  const bpmnFactory = modeler.get('bpmnFactory')
  const eventBus = modeler.get('eventBus')
  const connections = registry.filter((el) => el.waypoints && el.source && el.target)
  const edges = connections.map((el) => ({
    id: el.id,
    source: el.source.id,
    target: el.target.id,
    movable: el.type === 'bpmn:MessageFlow',
    points: el.waypoints.map((p) => ({ x: p.x, y: p.y })),
  }))
  const shapes = registry
    .filter((el) => !el.waypoints && el.type !== 'label' && el.parent
      && el.type !== 'bpmn:Participant' && el.type !== 'bpmn:Lane')
    .map((el) => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height }))
  const ids = separateOverlappingFlows(edges, shapes)
  for (const id of ids) {
    const el = registry.get(id)
    const points = edges.find((e) => e.id === id).points
    el.waypoints = points
    el.di.set('waypoint', bpmnFactory.createDiWaypoints(points))
    eventBus.fire('element.changed', { element: el })
  }
  return ids
}
