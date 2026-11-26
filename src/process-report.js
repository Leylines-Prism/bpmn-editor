// Rapport de processus : le diagramme ouvert mis en document, en PDF ou en Markdown.
//
// Tout se calcule à partir du modèle, sans saisie supplémentaire :
//   - chiffres clés et diagramme, les éléments concernés par un constat entourés de la
//     couleur de leur niveau ;
//   - constats de modélisation en trois niveaux : erreur (rouge), avertissement (orange),
//     à compléter (jaune). Sources : bpmnlint, contrôles du modèle (accessibilité, chemin
//     vers une fin, documentation, libellés, couloirs) et dernière simulation ;
//   - carte de chaleur de la dernière simulation, s'il y en a une ;
//   - axes d'amélioration déduits des constats, par priorité, avec l'effet attendu ;
//   - événements de fin (part des instances si une simulation a tourné), activités par
//     couloir, séquence des éléments.
// Le menu Expert et l'outil get_process_report passent par ici.

import { lang, T, num } from './i18n/lang.js'
import { flowIndex } from './simulation-stats.js'
import { heatColor, heatBadge } from './heatmap.js'

const LEVELS = ['error', 'warning', 'todo']
const LEVEL_LABEL = {
  error: () => T('Error', 'Erreur'),
  warning: () => T('Warning', 'Avertissement'),
  todo: () => T('To complete', 'À compléter'),
}
const PRIORITY_LABEL = {
  error: () => T('High', 'Haute'),
  warning: () => T('Medium', 'Moyenne'),
  todo: () => T('Low', 'Basse'),
}
const SOURCE_LABEL = {
  bpmnlint: () => 'bpmnlint',
  check: () => T('Check', 'Contrôle'),
  simulation: () => 'Simulation',
}
const COLORS = {
  error: { strong: '#DC2626', soft: '#FEF2F2', text: '#FFFFFF' },
  warning: { strong: '#F97316', soft: '#FFF7ED', text: '#FFFFFF' },
  todo: { strong: '#EAB308', soft: '#FEFCE8', text: '#422006' },
}
const TAG_FILL = { error: '#DC2626', warning: '#F97316', todo: '#FACC15' }

const TYPE_LABELS = {
  StartEvent: ['Start event', 'Événement de début'],
  EndEvent: ['End event', 'Événement de fin'],
  IntermediateCatchEvent: ['Intermediate catch event', 'Événement intermédiaire de réception'],
  IntermediateThrowEvent: ['Intermediate throw event', 'Événement intermédiaire d\'émission'],
  BoundaryEvent: ['Boundary event', 'Événement en bordure'],
  Task: ['Task', 'Tâche'],
  UserTask: ['User task', 'Tâche utilisateur'],
  ServiceTask: ['Service task', 'Tâche de service'],
  SendTask: ['Send task', 'Tâche d\'envoi'],
  ReceiveTask: ['Receive task', 'Tâche de réception'],
  ManualTask: ['Manual task', 'Tâche manuelle'],
  ScriptTask: ['Script task', 'Tâche de script'],
  BusinessRuleTask: ['Business rule task', 'Tâche de règle métier'],
  CallActivity: ['Call activity', 'Activité d\'appel'],
  SubProcess: ['Sub-process', 'Sous-processus'],
  Transaction: ['Transaction', 'Transaction'],
  ExclusiveGateway: ['Exclusive gateway', 'Passerelle exclusive'],
  ParallelGateway: ['Parallel gateway', 'Passerelle parallèle'],
  InclusiveGateway: ['Inclusive gateway', 'Passerelle inclusive'],
  EventBasedGateway: ['Event-based gateway', 'Passerelle basée sur les événements'],
  ComplexGateway: ['Complex gateway', 'Passerelle complexe'],
}
const EVENT_DEFINITIONS = {
  TimerEventDefinition: ['timer', 'minuterie'],
  MessageEventDefinition: ['message', 'message'],
  SignalEventDefinition: ['signal', 'signal'],
  ErrorEventDefinition: ['error', 'erreur'],
  EscalationEventDefinition: ['escalation', 'escalade'],
  ConditionalEventDefinition: ['conditional', 'conditionnel'],
  TerminateEventDefinition: ['terminate', 'terminaison'],
  CompensateEventDefinition: ['compensation', 'compensation'],
  LinkEventDefinition: ['link', 'lien'],
}

const is = (bo, type) => !!bo?.$instanceOf?.(type)
const isActivity = (bo) => is(bo, 'bpmn:Activity')
const isGateway = (bo) => is(bo, 'bpmn:Gateway')
const isEvent = (bo) => is(bo, 'bpmn:Event')
const short = (bo) => bo.$type.replace(/^bpmn:/, '')
const pick = ([en, fr]) => T(en, fr)
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const docOf = (bo) => clean((bo.documentation || []).map((d) => d.text).join(' '))

export function typeLabel(bo) {
  const base = TYPE_LABELS[short(bo)] ? pick(TYPE_LABELS[short(bo)]) : short(bo)
  const def = (bo.eventDefinitions || [])[0]
  const kind = def && EVENT_DEFINITIONS[short(def)]
  if (!kind) return base
  // « Événement intermédiaire (minuterie) » : la définition dit déjà s'il reçoit ou émet.
  const head = /Intermediate/.test(short(bo)) ? T('Intermediate event', 'Événement intermédiaire') : base
  return `${head} (${pick(kind)})`
}

// ── Lecture du modèle ───────────────────────────────────────────────────────

function collectContainers(definitions) {
  const processes = []
  const participants = []
  for (const root of definitions.rootElements || []) {
    if (is(root, 'bpmn:Process')) processes.push(root)
    if (is(root, 'bpmn:Collaboration')) participants.push(...(root.participants || []))
  }
  return { processes, participants }
}

// Éléments de flux d'un conteneur, sous-processus compris.
function allFlowElements(container, out = []) {
  for (const el of container.flowElements || []) {
    out.push(el)
    if (is(el, 'bpmn:SubProcess')) allFlowElements(el, out)
  }
  return out
}

function allLanes(laneSets, out = []) {
  for (const set of laneSets || []) {
    for (const lane of set.lanes || []) {
      out.push(lane)
      if (lane.childLaneSet) allLanes([lane.childLaneSet], out)
    }
  }
  return out
}

// ── Construction ────────────────────────────────────────────────────────────

// options : { name (nom du fichier), simulation (résultat de la carte de chaleur), lint (résultats bpmnlint) }
export async function buildReport(modeler, { name = '', simulation = null, lint = null } = {}) {
  const definitions = modeler.getDefinitions()
  const translate = modeler.get('translate')
  const { processes, participants } = collectContainers(definitions)
  const nodes = []
  const flows = []
  for (const p of processes) {
    for (const el of allFlowElements(p)) {
      if (is(el, 'bpmn:SequenceFlow')) flows.push(el)
      else if (is(el, 'bpmn:FlowNode')) nodes.push(el)
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = flowIndex(processes).outgoing

  // Couloirs : le plus profond qui référence l'élément.
  const laneOf = new Map()
  const lanes = []
  for (const p of processes) {
    for (const lane of allLanes(p.laneSets)) {
      lanes.push(lane)
      for (const ref of lane.flowNodeRef || []) laneOf.set(ref.id, lane)
    }
  }
  const laneName = (bo) => clean(laneOf.get(bo.id)?.name)

  // Événements en bordure, rangés sous leur activité.
  const boundaries = new Map()
  for (const n of nodes) {
    if (is(n, 'bpmn:BoundaryEvent') && n.attachedToRef) {
      if (!boundaries.has(n.attachedToRef.id)) boundaries.set(n.attachedToRef.id, [])
      boundaries.get(n.attachedToRef.id).push(n)
    }
  }

  // Ordre de lecture : parcours en largeur depuis les événements de début, sous-processus
  // et événements en bordure compris. Les passerelles ne sont pas numérotées : la colonne
  // des flux sortants les traverse.
  const starts = (container) => (container.flowElements || []).filter((e) => is(e, 'bpmn:StartEvent'))
  const visited = new Set()
  const order = []
  const queue = processes.flatMap((p) => starts(p))
  while (queue.length) {
    const n = queue.shift()
    if (visited.has(n.id)) continue
    visited.add(n.id)
    if (!isGateway(n)) order.push(n)
    if (is(n, 'bpmn:SubProcess')) queue.push(...starts(n))
    queue.push(...(boundaries.get(n.id) || []))
    for (const f of out(n)) if (f.targetRef) queue.push(f.targetRef)
  }
  const reachable = new Set(visited)
  // Les éléments que rien n'atteint ferment la liste.
  for (const n of nodes) if (!visited.has(n.id) && !isGateway(n)) order.push(n)
  const number = new Map(order.map((n, i) => [n.id, i + 1]))

  const displayName = (bo) => clean(bo.name) || typeLabel(bo)
  const ref = (bo) => (number.has(bo.id) ? `${number.get(bo.id)}. ${displayName(bo)}` : displayName(bo))
  const quoted = (list) => joinList(list.map((bo) => quote(displayName(bo))))

  // ── Constats ──
  const findings = []
  const flagged = new Set()
  const add = (f) => {
    findings.push(f)
    if (f.element) flagged.add(f.element.id)
  }

  // bpmnlint
  const lintResults = lint || (modeler.get('linting', false) ? await modeler.get('linting').lint() : {})
  for (const [rule, reports] of Object.entries(lintResults || {})) {
    for (const report of reports) {
      const level = report.category === 'warn' ? 'warning' : report.category === 'info' ? 'todo' : 'error'
      const element = byId.get(report.id) || findAny(definitions, report.id)
      add({
        kind: `lint:${rule}`,
        rule,
        level,
        element,
        title: `${clean(translate(report.message))}`,
        detail: lintDetail(rule),
        source: 'bpmnlint',
      })
    }
  }
  const lintIds = new Set(findings.map((f) => f.element?.id))

  // Éléments que rien n'atteint depuis un événement de début.
  for (const n of nodes) {
    if (reachable.has(n.id) || lintIds.has(n.id)) continue
    if (is(n, 'bpmn:StartEvent')) continue
    if (n.$parent?.triggeredByEvent) continue // contenu d'un sous-processus d'événement
    add({
      kind: 'unreachable', level: 'error', element: n, source: 'check',
      title: T('Unreachable element', 'Élément inaccessible'),
      detail: T('No path from a start event reaches this element.', 'Aucun chemin partant d\'un événement de début n\'atteint cet élément.'),
    })
  }

  // Éléments d'où aucun chemin ne mène à un événement de fin (boucle sans sortie, impasse).
  for (const container of [...processes, ...nodes.filter((n) => is(n, 'bpmn:SubProcess'))]) {
    if (container.triggeredByEvent) continue
    const own = (container.flowElements || []).filter((e) => is(e, 'bpmn:FlowNode'))
    const ends = own.filter((e) => is(e, 'bpmn:EndEvent'))
    if (!ends.length) continue
    const canEnd = new Set(ends.map((e) => e.id))
    let changed = true
    while (changed) {
      changed = false
      for (const n of own) {
        if (canEnd.has(n.id)) continue
        const next = out(n).map((f) => f.targetRef).concat(boundaries.get(n.id) || [])
        if (next.some((t) => t && canEnd.has(t.id))) {
          canEnd.add(n.id)
          changed = true
        }
      }
    }
    const stuck = own.filter((n) => !canEnd.has(n.id) && reachable.has(n.id) && !lintIds.has(n.id) && out(n).length && !is(n, 'bpmn:BoundaryEvent'))
    if (stuck.length) {
      const first = stuck.find((n) => !isGateway(n)) || stuck[0]
      add({
        kind: 'no-end', level: 'error', element: first, elements: stuck, source: 'check',
        title: T('No path to an end event', 'Aucun chemin vers un événement de fin'),
        detail: T(`Once a token reaches ${quoted(stuck)}, it can no longer reach an end event: the instance never completes.`,
          `Un jeton arrivé sur ${quoted(stuck)} ne peut plus atteindre d'événement de fin : l'instance ne se termine jamais.`),
      })
    }
  }

  // Reprise mesurée par la simulation.
  if (simulation?.runs) {
    for (const n of order) {
      const count = simulation.nodes[n.id] || 0
      if (isActivity(n) && count > simulation.runs) {
        add({
          kind: 'rework', level: 'warning', element: n, count, source: 'simulation',
          title: T('Frequent rework', 'Reprise fréquente'),
          detail: T(`${fmt(count / simulation.runs)} executions per instance (${num(count)} for ${num(simulation.runs)} instances).`,
            `${fmt(count / simulation.runs)} exécutions par instance (${num(count)} pour ${num(simulation.runs)} instances).`),
        })
      }
    }
  }

  // Informations manquantes.
  for (const n of order) {
    if (isActivity(n) && !is(n, 'bpmn:SubProcess') && !docOf(n)) {
      add({
        kind: 'doc', level: 'todo', element: n, source: 'check',
        title: T('No documentation', 'Documentation absente'),
        detail: T('The Documentation field is empty.', 'Le champ Documentation est vide.'),
      })
    }
  }
  for (const g of nodes.filter((n) => (is(n, 'bpmn:ExclusiveGateway') || is(n, 'bpmn:InclusiveGateway')) && out(n).length > 1)) {
    const unnamed = out(g).filter((f) => !clean(f.name))
    if (unnamed.length) {
      add({
        kind: 'flow-label', level: 'todo', element: g, source: 'check',
        title: T('Unlabeled conditions', 'Conditions sans libellé'),
        detail: T(`${unnamed.length} outgoing flow(s) of this gateway have no label: the answer to its question.`,
          `${unnamed.length} flux sortant(s) de cette passerelle sans libellé : la réponse à sa question.`),
      })
    }
  }
  for (const lane of lanes) {
    if (lane.childLaneSet) continue
    const activities = (lane.flowNodeRef || []).filter(isActivity)
    if (activities.length === 1) {
      add({
        kind: 'lane-single', level: 'todo', element: activities[0], lane, source: 'check',
        title: T('Lane with a single activity', 'Couloir à activité unique'),
        detail: T(`The lane ${quote(clean(lane.name))} contains only one activity.`, `Le couloir ${quote(clean(lane.name))} ne contient qu'une activité.`),
      })
    }
  }

  findings.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))
  const worst = new Map()
  for (const f of findings) {
    for (const el of f.elements || (f.element ? [f.element] : [])) {
      if (!worst.has(el.id)) worst.set(el.id, f.level)
    }
  }

  // ── Axes d'amélioration ──
  const axes = []
  const groups = new Map()
  for (const f of findings) {
    if (!groups.has(f.kind)) groups.set(f.kind, [])
    groups.get(f.kind).push(f)
  }
  for (const [kind, list] of groups) {
    const level = list[0].level
    const elements = [...new Map(list.flatMap((f) => f.elements || (f.element ? [f.element] : [])).map((e) => [e.id, e])).values()]
    const axis = axisFor(kind, list, elements, { quoted, simulation })
    if (axis) axes.push({ ...axis, level, source: kind === 'rework' ? 'simulation' : 'check' })
  }
  axes.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))

  // ── Séquence ──
  const describeNext = (n, depth = 0) => out(n).map((f) => {
    const t = f.targetRef
    if (!t) return ''
    const label = clean(f.name) ? `${clean(f.name)} : ` : ''
    if (isGateway(t) && depth < 3 && out(t).length) {
      const inner = describeNext(t, depth + 1)
      if (is(t, 'bpmn:ParallelGateway') && out(t).length > 1) return `${label}${T('in parallel', 'en parallèle')} : ${inner}`
      if (out(t).length > 1) return `${label}${clean(t.name) || T('Choice', 'Choix')} ${inner}`
      return label + inner
    }
    return label + ref(t)
  }).filter(Boolean).join(' ; ')

  const sequence = order.map((n) => ({
    number: number.get(n.id),
    id: n.id,
    name: displayName(n),
    type: typeLabel(n),
    lane: laneName(n),
    documentation: docOf(n),
    needsDoc: isActivity(n) && !is(n, 'bpmn:SubProcess'),
    next: describeNext(n),
    count: simulation?.runs ? simulation.nodes[n.id] || 0 : null,
    level: worst.get(n.id) || null,
    tags: [...new Set(findings.filter((f) => (f.elements || [f.element]).some((e) => e?.id === n.id)).map((f) => `${f.level}|${f.title}`))]
      .map((s) => { const [level, title] = s.split('|'); return { level, title } }),
  }))

  const ends = nodes.filter((n) => is(n, 'bpmn:EndEvent') && processes.includes(n.$parent)).map((n) => ({
    name: displayName(n),
    lane: laneName(n),
    share: simulation?.runs ? (simulation.nodes[n.id] || 0) / simulation.runs : null,
  }))

  const laneRows = lanes.filter((l) => !l.childLaneSet).map((l) => ({
    name: clean(l.name) || T('Unnamed lane', 'Couloir sans nom'),
    activities: (l.flowNodeRef || []).filter(isActivity).sort((a, b) => (number.get(a.id) || 0) - (number.get(b.id) || 0)).map(ref),
  }))

  const title = clean(participants.map((p) => p.name).filter(Boolean).join(' · '))
    || clean(processes.map((p) => p.name).filter(Boolean).join(' · '))
    || clean(name) || T('Process', 'Processus')

  return {
    title,
    fileName: clean(name),
    date: new Date(),
    counts: {
      activities: nodes.filter(isActivity).length,
      events: nodes.filter(isEvent).length,
      gateways: nodes.filter(isGateway).length,
      lanes: laneRows.length,
      error: findings.filter((f) => f.level === 'error').length,
      warning: findings.filter((f) => f.level === 'warning').length,
      todo: findings.filter((f) => f.level === 'todo').length,
    },
    findings: findings.map((f) => ({
      level: f.level,
      elementId: f.element?.id || null,
      element: f.element ? ref(f.element) : '',
      title: f.title,
      detail: f.detail,
      source: f.source,
      rule: f.rule || null,
    })),
    axes,
    ends,
    lanes: laneRows,
    sequence,
    simulation: simulation?.runs
      ? { runs: simulation.runs, source: simulation.source, truncated: simulation.truncated || 0, nodes: { ...simulation.nodes }, flows: { ...simulation.flows } }
      : null,
    flagged: Object.fromEntries(worst),
  }
}

function findAny(definitions, id) {
  for (const root of definitions.rootElements || []) {
    if (root.id === id) return root
    for (const el of allFlowElements(root)) if (el.id === id) return el
    for (const p of root.participants || []) if (p.id === id) return p
  }
  return null
}

const fmt = (x) => num(Math.round(x * 10) / 10)
const quote = (text) => (lang === 'fr' ? `« ${text} »` : `"${text}"`)
// « A », « B » et « C »
function joinList(items) {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${T('and', 'et')} ${items[items.length - 1]}`
}

function lintDetail(rule) {
  const details = {
    'fake-join': T('Several incoming sequence flows without a merging gateway: each incoming token triggers the activity.',
      'Plusieurs flux de séquence entrants sans passerelle de convergence : chaque jeton entrant déclenche l\'activité.'),
    'label-required': T('A name makes the diagram and this report readable.', 'Un nom rend le diagramme et ce rapport lisibles.'),
    'no-disconnected': T('The element is connected to no sequence flow.', 'L\'élément n\'est relié à aucun flux de séquence.'),
    'no-implicit-start': T('An element without incoming flow starts the process instead of a start event.', 'Un élément sans flux entrant démarre le processus à la place d\'un événement de début.'),
    'no-implicit-end': T('An element without outgoing flow ends the process instead of an end event.', 'Un élément sans flux sortant termine le processus à la place d\'un événement de fin.'),
    'superfluous-gateway': T('A gateway with one incoming and one outgoing flow does nothing.', 'Une passerelle à un flux entrant et un flux sortant ne sert à rien.'),
    'no-gateway-join-fork': T('A gateway both merges and splits: two gateways are clearer.', 'Une passerelle converge et diverge à la fois : deux passerelles sont plus claires.'),
    'start-event-required': T('Every process and sub-process needs a start event.', 'Chaque processus et sous-processus a besoin d\'un événement de début.'),
    'end-event-required': T('Every process and sub-process needs an end event.', 'Chaque processus et sous-processus a besoin d\'un événement de fin.'),
  }
  return details[rule] || T(`bpmnlint rule ${rule}.`, `Règle bpmnlint ${rule}.`)
}

function axisFor(kind, list, elements, { quoted, simulation }) {
  const n = list.length
  if (kind === 'unreachable') {
    return {
      title: T('Connect unreachable elements', 'Relier les éléments inaccessibles'),
      change: T(`Connect ${quoted(elements)} to the flow of the process, or remove them.`, `Relier ${quoted(elements)} au flux du processus, ou les supprimer.`),
      effect: T('Every element can be reached.', 'Chaque élément peut être atteint.'),
    }
  }
  if (kind === 'no-end') {
    return {
      title: T('Give the loop a way out', 'Donner une issue à la boucle'),
      change: T(`Add a path from ${quoted(elements)} to an end event, for example an exclusive gateway that limits repetitions.`,
        `Ajouter depuis ${quoted(elements)} un chemin vers un événement de fin, par exemple une passerelle exclusive qui limite les répétitions.`),
      effect: T('Every instance can complete.', 'Toutes les instances peuvent se terminer.'),
    }
  }
  if (kind === 'rework') {
    const top = list.reduce((a, b) => (b.count > a.count ? b : a))
    return {
      title: T(`Reduce rework on ${quoted([top.element])}`, `Réduire la reprise sur ${quoted([top.element])}`),
      change: T('Address the cause of the returns: information requested earlier, checks upstream.',
        'Traiter la cause des retours : informations demandées plus tôt, contrôle en amont.'),
      effect: T(`Up to ${num(top.count - simulation.runs)} executions avoided for ${num(simulation.runs)} instances.`,
        `Jusqu'à ${num(top.count - simulation.runs)} exécutions évitées pour ${num(simulation.runs)} instances.`),
    }
  }
  if (kind === 'doc') {
    return {
      title: T('Complete the documentation', 'Compléter la documentation'),
      change: T(`Describe ${quoted(elements)} in the Documentation field.`, `Décrire ${quoted(elements)} dans le champ Documentation.`),
      effect: T('Complete documentation.', 'Documentation complète.'),
    }
  }
  if (kind === 'flow-label') {
    return {
      title: T('Label the conditions', 'Nommer les conditions'),
      change: T(`Label the outgoing flows of ${quoted(elements)} with the answer to the gateway's question.`,
        `Libeller les flux sortants de ${quoted(elements)} par la réponse à la question de la passerelle.`),
      effect: T('The sequence reads without the diagram.', 'La séquence se lit sans le diagramme.'),
    }
  }
  if (kind === 'lane-single') {
    const names = joinList(list.map((f) => quote(clean(f.lane.name))))
    const one = list.length === 1
    return {
      title: T('Review the lanes', 'Revoir le découpage des couloirs'),
      change: one
        ? T(`The lane ${names} holds a single activity: merge it with another lane, or detail its work.`, `Le couloir ${names} ne porte qu'une activité : le fusionner avec un autre, ou détailler son travail.`)
        : T(`The lanes ${names} hold a single activity each: merge them, or detail their work.`, `Les couloirs ${names} ne portent chacun qu'une activité : les fusionner, ou détailler leur travail.`),
      effect: T('Clearer split of roles.', 'Répartition des rôles plus claire.'),
    }
  }
  if (kind === 'lint:fake-join') {
    return {
      title: T('Make merges explicit', 'Expliciter les convergences'),
      change: T(`Add a merging gateway before ${quoted(elements)}.`, `Ajouter une passerelle de convergence avant ${quoted(elements)}.`),
      effect: T(`${n} warning(s) cleared.`, `${n} avertissement(s) levé(s).`),
    }
  }
  if (kind.startsWith('lint:')) {
    const rule = kind.slice(5)
    return {
      title: T(`Fix: ${list[0].title}`, `Corriger : ${list[0].title}`),
      change: elements.length
        ? T(`Rule ${rule}, on ${quoted(elements)}.`, `Règle ${rule}, sur ${quoted(elements)}.`)
        : T(`Rule ${rule}.`, `Règle ${rule}.`),
      effect: T(`${n} finding(s) cleared.`, `${n} constat(s) levé(s).`),
    }
  }
  return null
}

// ── Markdown ────────────────────────────────────────────────────────────────

// Cellule de tableau : barres verticales et barres obliques inverses échappées.
const mdCell = (s) => clean(s).replace(/[\\|]/g, '\\$&')

export function reportToMarkdown(r) {
  const c = r.counts
  const lines = [
    `# ${r.title}`,
    '',
    T(`Process report generated on ${dateText(r.date)} by BPMN Pilot`, `Rapport de processus généré le ${dateText(r.date)} par BPMN Pilot`) + (r.fileName ? ` · ${r.fileName}.bpmn` : '') + '.',
    '',
    T(`${c.activities} activities, ${c.events} events, ${c.gateways} gateways, ${c.lanes} lanes. **${c.error} error(s), ${c.warning} warning(s), ${c.todo} to complete.**`,
      `${c.activities} activités, ${c.events} événements, ${c.gateways} passerelles, ${c.lanes} couloirs. **${c.error} erreur(s), ${c.warning} avertissement(s), ${c.todo} à compléter.**`),
    '',
    `## ${T('Modeling findings', 'Constats de modélisation')}`,
    '',
  ]
  if (r.findings.length) {
    lines.push(`| ${T('Level', 'Niveau')} | ${T('Element', 'Élément')} | ${T('Finding', 'Constat')} | ${T('Detail', 'Détail')} | Source |`, '|---|---|---|---|---|')
    for (const f of r.findings) lines.push(`| **${LEVEL_LABEL[f.level]().toUpperCase()}** | ${mdCell(f.element)} | ${mdCell(f.title)} | ${mdCell(f.detail)} | ${SOURCE_LABEL[f.source]()} |`)
  } else lines.push(T('No finding.', 'Aucun constat.'))
  lines.push('', `## ${T('Improvement areas', 'Axes d\'amélioration')}`, '')
  if (r.axes.length) {
    lines.push(`| ${T('Priority', 'Priorité')} | ${T('Area', 'Axe')} | ${T('Proposed change', 'Modification proposée')} | ${T('Expected effect', 'Effet attendu')} |`, '|---|---|---|---|')
    r.axes.forEach((a, i) => lines.push(`| **${PRIORITY_LABEL[a.level]().toUpperCase()}** | ${i + 1}. ${mdCell(a.title)} | ${mdCell(a.change)} | ${mdCell(a.effect)} |`))
  } else lines.push(T('Nothing to improve from the checks.', 'Rien à améliorer d\'après les contrôles.'))
  if (r.ends.length) {
    lines.push('', `## ${T('End events', 'Événements de fin')}`, '')
    lines.push(`| ${T('End event', 'Événement de fin')} | ${T('Lane', 'Couloir')} |${r.simulation ? ` ${T('Share of instances', 'Part des instances')} |` : ''}`, `|---|---|${r.simulation ? '---|' : ''}`)
    for (const e of r.ends) lines.push(`| ${mdCell(e.name)} | ${mdCell(e.lane)} |${r.simulation ? ` ${Math.round(e.share * 100)} % |` : ''}`)
  }
  if (r.lanes.length) {
    lines.push('', `## ${T('Activities by lane', 'Activités par couloir')}`, '')
    lines.push(`| ${T('Lane', 'Couloir')} | ${T('Activities', 'Activités')} |`, '|---|---|')
    for (const l of r.lanes) lines.push(`| ${mdCell(l.name)} | ${mdCell(l.activities.join(' · '))} |`)
  }
  lines.push('', `## ${T('Element sequence', 'Séquence des éléments')}`, '')
  lines.push(`| N° | ${T('Element', 'Élément')} | Type | ${T('Lane', 'Couloir')} | Documentation | ${T('Outgoing flows', 'Flux sortants')} |${r.simulation ? ` ${T('Instances', 'Instances')} |` : ''}`,
    `|---|---|---|---|---|---|${r.simulation ? '---|' : ''}`)
  for (const s of r.sequence) {
    const flag = s.level ? ` (${LEVEL_LABEL[s.level]().toLowerCase()})` : ''
    const doc = s.documentation || (s.needsDoc ? `*${T('to complete', 'à compléter')}*` : '')
    lines.push(`| ${s.number} | ${mdCell(s.name)}${flag} | ${mdCell(s.type)} | ${mdCell(s.lane)} | ${mdCell(doc)} | ${mdCell(s.next)} |${r.simulation ? ` ${s.count} |` : ''}`)
  }
  if (r.simulation) lines.push('', T(`Instances: tokens counted at the last simulation (${num(r.simulation.runs)} instances).`, `Instances : jetons comptés lors de la dernière simulation (${num(r.simulation.runs)} instances).`))
  return lines.join('\n') + '\n'
}

function dateText(date) {
  return date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── PDF ─────────────────────────────────────────────────────────────────────

// Les polices standard de jsPDF (WinAnsi) n'ont pas les espaces fines insécables.
const pdfText = (s) => String(s ?? '').replace(/[\u202f\u00a0\u2009]/g, ' ')

function hex(c) {
  const v = parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

// SVG du diagramme, les éléments concernés par un constat entourés de leur couleur.
async function flaggedSvg(modeler, flagged) {
  const { svg } = await modeler.saveSVG()
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  for (const [id, level] of Object.entries(flagged)) {
    const g = doc.querySelector(`g[data-element-id="${CSS.escape(id)}"] .djs-visual > :first-child`)
    if (!g) continue
    g.setAttribute('style', `${g.getAttribute('style') || ''};stroke:${COLORS[level].strong};stroke-width:4px;fill:${COLORS[level].soft}`)
  }
  return document.importNode(doc.documentElement, true)
}

// SVG du diagramme coloré selon les passages de jetons, comme la carte de chaleur du
// canevas : formes et flux du bleu pâle au rouge, épaisseur des flux selon le compte,
// pastille du compte sur les activités et les événements, gris pointillé si jamais atteint.
const rgb = (c) => c.match(/\d+/g).map(Number)
const SVG_NS = 'http://www.w3.org/2000/svg'

async function heatSvg(modeler, sim) {
  const { svg } = await modeler.saveSVG()
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const max = Math.max(1, ...Object.values(sim.nodes))
  const flowMax = Math.max(1, ...Object.values(sim.flows))
  const cold = 'stroke:#9CA3AF;stroke-dasharray:4 3;fill:#FFFFFF;opacity:0.7'
  // Les pastilles passent au-dessus de tout, flux compris.
  const badges = []
  for (const el of modeler.get('elementRegistry').getAll()) {
    if (el.type === 'label') continue
    const g = doc.querySelector(`g[data-element-id="${CSS.escape(el.id)}"]`)
    if (el.type === 'bpmn:SequenceFlow') {
      // Le trait est le chemin hors de <defs> ; la pointe de flèche, dans <defs>, prend la même couleur.
      const line = g?.querySelector('.djs-visual > path')
      if (!line) continue
      const n = sim.flows[el.id] || 0
      const color = n ? heatColor(n / flowMax) : '#9CA3AF'
      const width = n ? 2 + 5 * (n / flowMax) : 2
      line.setAttribute('style', `${line.getAttribute('style') || ''};stroke:${color};` + (n
        ? `stroke-width:${width.toFixed(1)}px`
        : 'stroke-dasharray:4 3'))
      g.querySelectorAll('marker').forEach((marker) => {
        // Pointe de taille fixe, quelle que soit l'épaisseur du trait.
        const size = (20 / width).toFixed(2)
        Object.entries({ markerWidth: size, markerHeight: size }).forEach(([k, v]) => marker.setAttribute(k, v))
        marker.querySelectorAll('path').forEach((m) => m.setAttribute('style', `${m.getAttribute('style') || ''};stroke:${color};fill:${color}`))
      })
      continue
    }
    const shape = g?.querySelector('.djs-visual > :first-child')
    if (!shape) continue
    if (!el.businessObject?.$instanceOf?.('bpmn:FlowNode') || !el.width) continue
    const n = sim.nodes[el.id] || 0
    if (!n) {
      shape.setAttribute('style', `${shape.getAttribute('style') || ''};${cold}`)
      continue
    }
    const color = heatColor(n / max)
    shape.setAttribute('style', `${shape.getAttribute('style') || ''};stroke:${color};fill:${color};fill-opacity:0.55`)
    if (el.type.endsWith('Gateway')) continue
    // Pastille du compte, au-dessus à droite de la forme.
    const text = heatBadge(n, sim)
    const w = text.length * 5.6 + 8
    const badge = doc.createElementNS(SVG_NS, 'g')
    badge.setAttribute('transform', `translate(${el.x + el.width - w + (el.width > 60 ? -4 : 12)}, ${el.y - 9})`)
    const rect = doc.createElementNS(SVG_NS, 'rect')
    Object.entries({ width: w, height: 13, rx: 6.5, ry: 6.5, style: 'fill:#1F2937;stroke:none' }).forEach(([k, v]) => rect.setAttribute(k, v))
    const label = doc.createElementNS(SVG_NS, 'text')
    Object.entries({ x: w / 2, y: 9.5, 'text-anchor': 'middle', style: 'fill:#FFFFFF;font-family:Arial, sans-serif;font-size:9px;font-weight:bold' }).forEach(([k, v]) => label.setAttribute(k, v))
    label.textContent = text
    badge.append(rect, label)
    badges.push(badge)
  }
  doc.documentElement.append(...badges)
  return document.importNode(doc.documentElement, true)
}

export async function reportToPdf(modeler, r) {
  const [{ jsPDF }, { svg2pdf }, { autoTable }] = await Promise.all([import('jspdf'), import('svg2pdf.js'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12
  const ink = [31, 41, 55]
  const muted = [107, 114, 128]
  const blue = [30, 58, 138]
  doc.setProperties({ title: pdfText(r.title), subject: T('Process report', 'Rapport de processus'), creator: 'BPMN Pilot' })

  let y = M + 4
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...ink)
  doc.text(pdfText(r.title), M, y)
  y += 5.5
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...muted)
  doc.text(pdfText(T(`Process report · generated on ${dateText(r.date)} by BPMN Pilot`, `Rapport de processus · généré le ${dateText(r.date)} par BPMN Pilot`) + (r.fileName ? ` · ${r.fileName}.bpmn` : '')), M, y)
  y += 4

  // Chiffres clés.
  const c = r.counts
  const tiles = [
    [c.activities, T('activities', 'activités')],
    [c.events, T('events', 'événements')],
    [c.gateways, T('gateways', 'passerelles')],
    [c.lanes, T('lanes', 'couloirs')],
    [c.error, T('error(s)', 'erreur(s)'), 'error'],
    [c.warning, T('warning(s)', 'avertissement(s)'), 'warning'],
    [c.todo, T('to complete', 'à compléter'), 'todo'],
  ]
  const tw = 30
  tiles.forEach(([value, label, level], i) => {
    const x = M + i * (tw + 3)
    if (level) {
      doc.setFillColor(...hex(COLORS[level].soft)).setDrawColor(...hex(COLORS[level].strong))
    } else doc.setFillColor(255, 255, 255).setDrawColor(229, 231, 235)
    doc.roundedRect(x, y, tw, 13, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...(level ? hex(level === 'todo' ? '#A16207' : COLORS[level].strong) : blue))
    doc.text(String(value), x + 3, y + 6)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...ink)
    doc.text(pdfText(label), x + 3, y + 10.5)
  })
  y += 17

  // Priorité : la première erreur.
  const first = r.findings.find((f) => f.level === 'error')
  if (first) {
    doc.setFillColor(...hex(COLORS.error.soft)).setDrawColor(254, 202, 202)
    doc.roundedRect(M, y, W - 2 * M, 8, 2, 2, 'FD')
    tag(doc, M + 2.5, y + 1.8, T('Priority', 'Priorité'), 'error')
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...ink)
    const head = pdfText(first.element ? `${first.element} : ` : '')
    doc.text(head, M + 22, y + 5.4)
    doc.setFont('helvetica', 'normal')
    doc.text(pdfText(first.title), M + 22 + doc.getTextWidth(head), y + 5.4)
    y += 11
  }

  // Diagramme.
  // svg2pdf lit les styles calculés : le SVG doit être dans la page le temps du dessin.
  const drawDiagram = async (svgEl, maxH, maxScale) => {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden'
    host.append(svgEl)
    document.body.appendChild(host)
    try {
      const el = host.querySelector('svg')
      const sw = parseFloat(el.getAttribute('width')) || 800
      const sh = parseFloat(el.getAttribute('height')) || 600
      const maxW = W - 2 * M
      const scale = Math.min(maxW / sw, maxH / sh, maxScale)
      const dw = sw * scale
      const dh = sh * scale
      doc.setDrawColor(229, 231, 235)
      doc.roundedRect(M, y, maxW, dh + 4, 2, 2, 'S')
      await svg2pdf(el, doc, { x: M + (maxW - dw) / 2, y: y + 2, width: dw, height: dh })
      y += dh + 8
    } finally {
      host.remove()
    }
  }
  await drawDiagram(await flaggedSvg(modeler, r.flagged), Math.max(60, H - y - M - 30), 0.35)

  const section = (title) => {
    if (y > H - M - 25) { doc.addPage(); y = M + 4 }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...blue)
    doc.text(pdfText(title), M, y + 4)
    doc.setDrawColor(37, 99, 235).setLineWidth(0.6).line(M, y + 6, W - M, y + 6).setLineWidth(0.2)
    y += 8
  }

  const baseTable = {
    margin: { left: M, right: M, top: M },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: ink, lineColor: [229, 231, 235], lineWidth: 0.2, valign: 'top' },
    headStyles: { fillColor: [243, 244, 246], textColor: ink, fontStyle: 'bold' },
  }
  const table = (opts) => {
    autoTable(doc, { ...baseTable, startY: y, ...opts })
    y = doc.lastAutoTable.finalY + 6
  }
  // Ligne teintée selon le niveau, liseré à gauche, étiquette de couleur dans la première colonne.
  const levelHooks = (levels, labels) => ({
    didParseCell: (d) => {
      if (d.section !== 'body') return
      const level = levels[d.row.index]
      if (level) d.cell.styles.fillColor = hex(COLORS[level].soft)
      if (d.column.index === 0 && labels) d.cell.text = ['']
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 0) return
      const level = levels[d.row.index]
      if (!level) return
      doc.setFillColor(...hex(COLORS[level].strong))
      doc.rect(d.cell.x, d.cell.y, 1.2, d.cell.height, 'F')
      if (labels) tag(doc, d.cell.x + 2.4, d.cell.y + 1.4, labels[d.row.index], level)
    },
  })

  section(T('Modeling findings', 'Constats de modélisation'))
  if (r.findings.length) {
    table({
      head: [[T('Level', 'Niveau'), T('Element', 'Élément'), T('Finding', 'Constat'), T('Detail', 'Détail'), 'Source']],
      body: r.findings.map((f) => ['', pdfText(f.element), pdfText(f.title), pdfText(f.detail), SOURCE_LABEL[f.source]()]),
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 48, fontStyle: 'bold' }, 2: { cellWidth: 52 }, 4: { cellWidth: 20, textColor: muted } },
      ...levelHooks(r.findings.map((f) => f.level), r.findings.map((f) => LEVEL_LABEL[f.level]())),
    })
  } else note(T('No finding.', 'Aucun constat.'))

  // Carte de chaleur, sur sa propre page, si une simulation a tourné.
  if (r.simulation) {
    doc.addPage()
    y = M + 4
    section(T('Heatmap', 'Carte de chaleur'))
    const sim = r.simulation
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...ink)
    doc.text(pdfText(sim.source === 'batch'
      ? T(`${num(sim.runs)} tokens computed from the gateway probabilities.`, `${num(sim.runs)} jetons calculés selon les probabilités des passerelles.`)
      : T(`${num(sim.runs)} token(s) played during the simulation.`, `${num(sim.runs)} jeton(s) joué(s) pendant la simulation.`)), M, y + 2)
    y += 5
    await drawDiagram(await heatSvg(modeler, sim), H - y - M - 22, 0.6)
    // Légende : dégradé, bornes et lecture.
    const max = Math.max(1, ...Object.values(sim.nodes))
    const lw = 70
    for (let i = 0; i < 70; i++) {
      doc.setFillColor(...rgb(heatColor(i / 69)))
      doc.rect(M + (i * lw) / 70, y, lw / 70 + 0.05, 3, 'F')
    }
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...muted)
    doc.text('1', M, y + 6.5)
    doc.text(num(max), M + lw, y + 6.5, { align: 'right' })
    doc.text(pdfText(T('Passes per element, from pale blue to red. Flow width follows the count. Dashed grey: never reached.',
      'Passages par élément, du bleu pâle au rouge. Épaisseur des flux selon le nombre de passages. Gris pointillé : jamais atteint.')), M + lw + 6, y + 2.6)
    if (sim.source === 'batch') doc.text(pdfText(T('Badge: passes · share of instances (or executions per instance above one).', 'Pastille : passages · part des instances (ou exécutions par instance au-delà de une).')), M + lw + 6, y + 6.5)
    y += 10
    if (sim.truncated) {
      doc.setTextColor(...hex(COLORS.warning.strong))
      doc.text(pdfText(T(`${num(sim.truncated)} instance(s) stopped after 5,000 steps: check for a loop without exit.`, `${num(sim.truncated)} instance(s) arrêtée(s) après 5 000 étapes : vérifiez qu'aucune boucle n'est sans sortie.`)), M, y)
      y += 6
    }
  }

  section(T('Improvement areas', 'Axes d\'amélioration'))
  if (r.axes.length) {
    table({
      head: [[T('Priority', 'Priorité'), T('Area', 'Axe'), T('Proposed change', 'Modification proposée'), T('Expected effect', 'Effet attendu')]],
      body: r.axes.map((a, i) => ['', pdfText(`${i + 1}. ${a.title}`), pdfText(a.change), pdfText(a.effect)]),
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 62, fontStyle: 'bold' }, 3: { cellWidth: 70, textColor: [21, 128, 61], fontStyle: 'bold' } },
      ...levelHooks(r.axes.map((a) => a.level), r.axes.map((a) => PRIORITY_LABEL[a.level]())),
    })
  } else note(T('Nothing to improve from the checks.', 'Rien à améliorer d\'après les contrôles.'))

  if (r.ends.length) {
    section(T('End events', 'Événements de fin'))
    table({
      head: [[T('End event', 'Événement de fin'), T('Lane', 'Couloir'), ...(r.simulation ? [T('Share of instances (simulation)', 'Part des instances (simulation)')] : [])]],
      body: r.ends.map((e) => [pdfText(e.name), pdfText(e.lane), ...(r.simulation ? [`${Math.round(e.share * 100)} %`] : [])]),
      columnStyles: { 0: { fontStyle: 'bold' } },
    })
  }

  if (r.lanes.length) {
    section(T('Activities by lane', 'Activités par couloir'))
    table({
      head: [[T('Lane', 'Couloir'), T('Activities', 'Activités')]],
      body: r.lanes.map((l) => [pdfText(l.name), pdfText(l.activities.join(' · '))]),
      columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: [37, 99, 235] } },
    })
  }

  doc.addPage()
  y = M + 4
  section(T('Element sequence', 'Séquence des éléments'))
  const levels = r.sequence.map((s) => s.level)
  table({
    head: [['N°', T('Element', 'Élément'), 'Type', T('Lane', 'Couloir'), 'Documentation', T('Outgoing flows', 'Flux sortants'), ...(r.simulation ? ['Instances'] : [])]],
    body: r.sequence.map((s) => [
      String(s.number),
      pdfText(s.name + (s.tags.length ? '\n' + s.tags.map((t) => t.title).join(', ') : '')),
      pdfText(s.type),
      pdfText(s.lane),
      pdfText(s.documentation || (s.needsDoc ? T('to complete', 'à compléter') : '–')),
      pdfText(s.next || '–'),
      ...(r.simulation ? [String(s.count)] : []),
    ]),
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 46, fontStyle: 'bold' }, 2: { cellWidth: 32 }, 3: { cellWidth: 30, textColor: [37, 99, 235] }, 4: { cellWidth: 55 }, ...(r.simulation ? { 6: { cellWidth: 18, halign: 'right' } } : {}) },
    didParseCell: (d) => {
      if (d.section !== 'body') return
      const s = r.sequence[d.row.index]
      if (s.level) d.cell.styles.fillColor = hex(COLORS[s.level].soft)
      if (d.column.index === 4 && !s.documentation && s.needsDoc) {
        d.cell.styles.fillColor = hex('#FEF9C3')
        d.cell.styles.textColor = hex('#A16207')
        d.cell.styles.fontStyle = 'italic'
      }
      if (r.simulation && d.column.index === 6 && s.count > r.simulation.runs) {
        d.cell.styles.textColor = hex(COLORS.warning.strong)
        d.cell.styles.fontStyle = 'bold'
      }
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 0) return
      const level = levels[d.row.index]
      if (!level) return
      doc.setFillColor(...hex(COLORS[level].strong))
      doc.rect(d.cell.x, d.cell.y, 1.2, d.cell.height, 'F')
    },
  })
  if (r.simulation) note(T(`Instances: tokens counted at the last simulation (${num(r.simulation.runs)} instances).`, `Instances : jetons comptés lors de la dernière simulation (${num(r.simulation.runs)} instances).`))

  // Pied de page : numéro de page.
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...muted)
    doc.text(pdfText(`${r.title} · ${i}/${pages}`), W - M, H - 6, { align: 'right' })
  }
  return doc.output('blob')

  function note(text) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...muted)
    doc.text(pdfText(text), M, y)
    y += 6
  }
}

// Étiquette arrondie de couleur, texte en gras.
function tag(doc, x, y, text, level) {
  doc.setFont('helvetica', 'bold').setFontSize(7)
  const w = doc.getTextWidth(pdfText(text)) + 3.2
  doc.setFillColor(...hex(TAG_FILL[level]))
  doc.roundedRect(x, y, w, 4.2, 1, 1, 'F')
  doc.setTextColor(...hex(COLORS[level].text))
  doc.text(pdfText(text), x + 1.6, y + 3)
}

