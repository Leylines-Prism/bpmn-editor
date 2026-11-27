// Rapport de contrôle d'un diagramme : compteurs d'éléments et six contrôles.
//
//   xml         le document se lit (XML bien formé)
//   metamodel   chaque élément et attribut existe dans le métamodèle BPMN 2.0 (bpmn-moddle)
//   references  les références se résolvent, les identifiants sont uniques, et chaque
//               liaison reste dans sa portée (flux de séquence dans son processus,
//               flux de message entre deux pools, événement de bordure à côté de sa tâche)
//   di          chaque élément est dessiné (BPMNShape avec Bounds, BPMNEdge avec 2 points au moins)
//   reimport    bpmn-js réimporte le document sans avertissement
//   lint        aucune erreur des règles bpmnlint
//
// checkXml() ne dépend de rien : l'appelant fournit le moddle (avec ses extensions),
// et, s'il les a, de quoi réimporter dans bpmn-js et lancer bpmnlint. Le rapport sert
// au chat intégré (autocorrection, ligne sous la réponse) et à l'outil validate_diagram.
// checkDiagram(modeler) est la version pour l'éditeur ouvert.

export const CHECK_IDS = ['xml', 'metamodel', 'references', 'di', 'reimport', 'lint']
const MAX_PROBLEMS = 20

// Préfixes des espaces de noms BPMN : un attribut inconnu ailleurs est une extension, permise.
const BPMN_PREFIXES = new Set(['', 'bpmn', 'bpmn2', 'semantic', 'model', 'bpmndi', 'dc', 'di'])

const firstLine = (message) => String(message || '').split('\n')[0]
const nestedError = (message) => String(message || '').match(/nested error: (.*)/)?.[1]

// Éléments qui doivent avoir une forme ou un tracé.
const DRAWN_TYPES = [
  'bpmn:FlowNode',
  'bpmn:SequenceFlow',
  'bpmn:DataObjectReference',
  'bpmn:DataStoreReference',
  'bpmn:Participant',
  'bpmn:Lane',
  'bpmn:MessageFlow',
  'bpmn:TextAnnotation',
  'bpmn:Association',
  'bpmn:Group',
]
const EDGE_TYPES = ['bpmn:SequenceFlow', 'bpmn:MessageFlow', 'bpmn:Association', 'bpmn:DataInputAssociation', 'bpmn:DataOutputAssociation']

const isA = (el, type) => !!el?.$instanceOf?.(type)
const isAny = (el, types) => types.some((t) => isA(el, t))

// Parcourt le modèle : appelle visit(élément, conteneur) pour chaque élément du contenu.
function walk(definitions, visit) {
  const container = (owner) => {
    for (const el of owner.flowElements || []) {
      visit(el, owner)
      if (el.flowElements) container(el)
      for (const set of el.laneSets || []) lanes(set, el)
      for (const a of el.artifacts || []) visit(a, el)
    }
  }
  const lanes = (set, owner) => {
    for (const lane of set.lanes || []) {
      visit(lane, owner)
      if (lane.childLaneSet) lanes(lane.childLaneSet, owner)
    }
  }
  for (const root of definitions.rootElements || []) {
    if (isA(root, 'bpmn:Process')) {
      container(root)
      for (const set of root.laneSets || []) lanes(set, root)
      for (const a of root.artifacts || []) visit(a, root)
    } else if (isA(root, 'bpmn:Collaboration')) {
      for (const p of root.participants || []) visit(p, root)
      for (const f of root.messageFlows || []) visit(f, root)
      for (const a of root.artifacts || []) visit(a, root)
    }
  }
}

export function countElements(definitions) {
  const counts = { pools: 0, lanes: 0, activities: 0, gateways: 0, events: 0, sequenceFlows: 0, messageFlows: 0, dataObjects: 0, annotations: 0 }
  if (!definitions) return counts
  walk(definitions, (el) => {
    if (isA(el, 'bpmn:Participant')) counts.pools++
    else if (isA(el, 'bpmn:Lane')) counts.lanes++
    else if (isA(el, 'bpmn:Activity')) counts.activities++
    else if (isA(el, 'bpmn:Gateway')) counts.gateways++
    else if (isA(el, 'bpmn:Event')) counts.events++
    else if (isA(el, 'bpmn:SequenceFlow')) counts.sequenceFlows++
    else if (isA(el, 'bpmn:MessageFlow')) counts.messageFlows++
    else if (isAny(el, ['bpmn:DataObjectReference', 'bpmn:DataStoreReference'])) counts.dataObjects++
    else if (isA(el, 'bpmn:TextAnnotation')) counts.annotations++
  })
  return counts
}

// Références et portées, sur le modèle lu.
function scopeProblems(definitions) {
  const problems = []
  const add = (el, message) => problems.push({ id: el?.id, message })
  const containerOf = new Map()
  walk(definitions, (el, owner) => containerOf.set(el, owner))

  // Pool d'un élément : le participant lui-même, ou celui dont le processus contient l'élément.
  const participants = []
  for (const root of definitions.rootElements || []) {
    if (isA(root, 'bpmn:Collaboration')) participants.push(...(root.participants || []))
  }
  const processOf = (el) => {
    let c = containerOf.get(el)
    while (c && !isA(c, 'bpmn:Process')) c = containerOf.get(c)
    return c
  }
  const poolOf = (el) => (isA(el, 'bpmn:Participant') ? el : participants.find((p) => p.processRef && p.processRef === processOf(el)))

  walk(definitions, (el, owner) => {
    if (isA(el, 'bpmn:SequenceFlow')) {
      if (!el.sourceRef || !el.targetRef) return add(el, `sequence flow ${el.id} has no ${el.sourceRef ? 'target' : 'source'}`)
      for (const end of [el.sourceRef, el.targetRef]) {
        if (containerOf.get(end) !== owner) add(el, `sequence flow ${el.id} connects ${end.id}, which is outside its process or subprocess: use a message flow between pools`)
      }
    } else if (isA(el, 'bpmn:MessageFlow')) {
      if (!el.sourceRef || !el.targetRef) return add(el, `message flow ${el.id} has no ${el.sourceRef ? 'target' : 'source'}`)
      const a = poolOf(el.sourceRef)
      const b = poolOf(el.targetRef)
      if (!a || !b) add(el, `message flow ${el.id} must connect elements of two pools`)
      else if (a === b) add(el, `message flow ${el.id} stays inside pool ${a.id}: use a sequence flow`)
    } else if (isA(el, 'bpmn:BoundaryEvent')) {
      if (!el.attachedToRef) add(el, `boundary event ${el.id} is attached to nothing`)
      else if (containerOf.get(el.attachedToRef) !== owner) add(el, `boundary event ${el.id} is not in the same process as ${el.attachedToRef.id}`)
    } else if (isA(el, 'bpmn:Lane')) {
      for (const node of el.flowNodeRef || []) {
        if (processOf(node) !== processOf(el)) add(el, `lane ${el.id} lists ${node.id}, which belongs to another process`)
      }
    }
    if (el.default && el.default.sourceRef !== el) add(el, `default flow ${el.default.id} of ${el.id} does not start from it`)
  })
  return problems
}

// Partie graphique : ce qui est dessiné, et comment.
function diProblems(definitions) {
  const problems = []
  const drawn = new Set()
  const diagrams = definitions.diagrams || []
  if (!diagrams.length) return [{ message: 'the document has no BPMNDiagram' }]
  for (const diagram of diagrams) {
    const plane = diagram.plane
    if (!plane?.bpmnElement) {
      problems.push({ id: diagram.id, message: `diagram ${diagram.id} has no plane for a process or collaboration` })
      continue
    }
    drawn.add(plane.bpmnElement)
    for (const di of plane.planeElement || []) {
      const el = di.bpmnElement
      if (!el) {
        problems.push({ id: di.id, message: `${di.$type.replace('bpmndi:', '')} ${di.id} draws no element` })
        continue
      }
      if (drawn.has(el)) problems.push({ id: el.id, message: `${el.id} is drawn twice` })
      drawn.add(el)
      if (isA(di, 'bpmndi:BPMNShape') && !di.bounds) problems.push({ id: el.id, message: `shape of ${el.id} has no Bounds` })
      if (isA(di, 'bpmndi:BPMNEdge') && (di.waypoint || []).length < 2) problems.push({ id: el.id, message: `connection ${el.id} has fewer than 2 waypoints` })
      if (isA(di, 'bpmndi:BPMNShape') && isAny(el, EDGE_TYPES)) problems.push({ id: el.id, message: `${el.id} is a connection drawn as a shape` })
      if (isA(di, 'bpmndi:BPMNEdge') && !isAny(el, EDGE_TYPES)) problems.push({ id: el.id, message: `${el.id} is a shape drawn as a connection` })
    }
  }
  const missing = []
  walk(definitions, (el) => {
    if (isAny(el, DRAWN_TYPES) && !drawn.has(el)) missing.push(el)
  })
  for (const el of missing) problems.push({ id: el.id, message: `${el.$type.replace('bpmn:', '')} ${el.id}${el.name ? ` "${el.name}"` : ''} is not drawn (no BPMNShape or BPMNEdge)` })
  return problems
}

const result = (id, problems, extra = {}) => ({ id, ok: problems.length === 0, problems: problems.slice(0, MAX_PROBLEMS), ...(problems.length > MAX_PROBLEMS ? { more: problems.length - MAX_PROBLEMS } : {}), ...extra })
const skipped = (id, reason) => ({ id, ok: true, skipped: true, problems: [], reason })

// moddle : instance de bpmn-moddle (celle de l'éditeur, avec ses extensions).
// reimport(xml) : renvoie { warnings } d'un import dans bpmn-js, ou null si indisponible.
// lint(definitions) : renvoie les résultats de bpmnlint ({ règle: [rapports] }), ou null.
export async function checkXml(xml, { moddle, reimport = null, lint = null }) {
  const checks = []
  let definitions
  let warnings
  try {
    ;({ rootElement: definitions, warnings = [] } = await moddle.fromXML(xml, 'bpmn:Definitions'))
    checks.push(result('xml', []))
  } catch (err) {
    checks.push(result('xml', [{ message: nestedError(err.message) ? `${nestedError(err.message)} (${firstLine(err.message)})` : firstLine(err.message) }]))
    for (const id of CHECK_IDS.slice(1)) checks.push(skipped(id, 'xml'))
    return summarize(checks, countElements(null), null)
  }

  const metamodel = []
  const references = []
  for (const w of warnings) {
    const message = firstLine(w.message)
    const nested = nestedError(w.message)
    if (/^unresolved reference/.test(message)) references.push({ id: w.element?.id, message: `${message}${w.element?.id ? ` in ${w.element.id}` : ''}` })
    else if (nested && /duplicate ID/.test(nested)) references.push({ message: nested })
    else if (/^unknown attribute <([^>]*)>/.test(message)) {
      const name = message.match(/<([^>]*)>/)[1]
      const prefix = name.includes(':') ? name.split(':')[0] : ''
      if (BPMN_PREFIXES.has(prefix)) metamodel.push({ id: w.element?.id, message: `${message}${w.element?.id ? ` on ${w.element.id}` : ''}` })
    } else metamodel.push({ message: nested ? `${nested} (${message.replace(/ detected$/, '')})` : message })
  }
  checks.push(result('metamodel', metamodel))
  checks.push(result('references', [...references, ...scopeProblems(definitions)]))
  checks.push(result('di', diProblems(definitions)))

  if (reimport) {
    try {
      const out = await reimport(xml)
      // Les avertissements de lecture sont déjà comptés plus haut : seuls restent ceux de l'import.
      const seen = new Set(warnings.map((w) => firstLine(w.message)))
      const own = (out?.warnings || []).filter((w) => !seen.has(firstLine(w.message)))
      checks.push(out ? result('reimport', own.map((w) => ({ id: w.element?.id, message: firstLine(w.message) }))) : skipped('reimport', 'unavailable'))
    } catch (err) {
      checks.push(result('reimport', [{ message: firstLine(err.message) }]))
    }
  } else checks.push(skipped('reimport', 'unavailable'))

  let lintSummary = null
  if (lint) {
    const results = await lint(definitions)
    if (results) {
      const issues = []
      for (const [rule, reports] of Object.entries(results)) {
        for (const report of reports) issues.push({ id: report.id, category: report.category, rule, message: report.message })
      }
      const count = (...cats) => issues.filter((i) => cats.includes(i.category)).length
      lintSummary = { errors: count('error', 'rule-error'), warnings: count('warn'), infos: count('info'), issues }
      checks.push(result('lint', issues.filter((i) => i.category === 'error' || i.category === 'rule-error').map(({ id, rule, message }) => ({ id, rule, message }))))
    } else checks.push(skipped('lint', 'unavailable'))
  } else checks.push(skipped('lint', 'unavailable'))

  return summarize(checks, countElements(definitions), lintSummary)
}

function summarize(checks, counts, lint) {
  const run = checks.filter((c) => !c.skipped)
  return { counts, checks, passed: run.filter((c) => c.ok).length, total: run.length, failed: run.filter((c) => !c.ok).map((c) => c.id), lint }
}

// Nombre de problèmes bloquants : ce que l'autocorrection cherche à faire baisser.
export const problemCount = (report) => report.checks.reduce((n, c) => n + (c.ok ? 0 : c.problems.length + (c.more || 0)), 0)

// Version pour l'éditeur ouvert : le moddle de bpmn-js, un réimport dans un visualiseur
// caché, et bpmnlint tel que réglé dans l'éditeur.
let viewer = null
export async function checkDiagram(modeler) {
  const { xml } = await modeler.saveXML({ format: true })
  const linting = modeler.get('linting', false)
  return checkXml(xml, {
    moddle: modeler.get('moddle'),
    reimport: async (doc) => {
      if (!viewer) {
        const { default: Viewer } = await import('bpmn-js/lib/Viewer')
        const container = document.createElement('div')
        container.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;visibility:hidden'
        document.body.append(container)
        viewer = new Viewer({ container, moddleExtensions: modeler._moddleExtensions })
      }
      return viewer.importXML(doc)
    },
    lint: linting ? () => linting.lint() : null,
  })
}
