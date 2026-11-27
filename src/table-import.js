// Ouvrir > Depuis un tableau : une ligne par étape, convertie en processus BPMN sans IA.
//
// Les colonnes reprennent celles du modèle Excel « Organigramme » de Visio Data
// Visualizer (Process Step ID, Process Step Description, Next Step ID, Connector
// Label, Shape Type, Function) et celles de la saisie rapide de SAP Signavio
// (Quoi, Qui, Comment), avec leurs équivalents français. Seule la colonne
// des libellés est obligatoire : sans identifiants ni étapes suivantes, les lignes
// s'enchaînent dans l'ordre. Le XML produit n'a pas de partie graphique : l'import
// le range avec bpmn-auto-layout, couloirs compris.

import { escapeXml } from './zip-write.js'
import { parseDelimited, rowsToXlsx } from './sheet-io.js'

export { parseDelimited, rowsToXlsx }

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

// En-têtes reconnus, après mise en minuscules et retrait des accents et de la ponctuation.
const HEADERS = {
  id: ['process step id', 'step id', 'id', 'n', 'no', 'num', 'numero', 'id etape', 'id de l etape', 'identifiant', 'etape id', 'schritt id'],
  label: ['process step description', 'step description', 'description', 'libelle', 'nom', 'name', 'step', 'etape', 'activite', 'activity', 'task', 'tache', 'beschreibung', 'what', 'quoi'],
  next: ['next step id', 'next step', 'next steps', 'next', 'etape suivante', 'etapes suivantes', 'suivant', 'suivante', 'suivants', 'id etape suivante', 'nachster schritt', 'naechster schritt'],
  flowLabel: ['connector label', 'connector labels', 'libelle du lien', 'libelles des liens', 'libelle lien', 'condition', 'conditions', 'branche', 'branches', 'verbindungsbeschriftung'],
  type: ['shape type', 'type', 'type de forme', 'forme', 'element', 'type d element'],
  lane: ['function', 'fonction', 'role', 'acteur', 'actor', 'responsable', 'swimlane', 'couloir', 'lane', 'service', 'department', 'departement', 'funktion', 'who', 'qui'],
  assignee: ['assignee', 'assigned to', 'assigne a', 'assignee a', 'attribue a', 'affecte a', 'owner name', 'person', 'personne', 'qui exactement', 'zustandig'],
  systems: ['systems', 'system', 'systems used', 'systemes', 'systeme', 'systemes utilises', 'outils', 'outil', 'tools', 'applications', 'application', 'logiciels'],
  accountable: ['accountable', 'a', 'valide', 'validateur', 'approbateur', 'approver', 'responsable du resultat'],
  consulted: ['consulted', 'c', 'consulte', 'consultes'],
  informed: ['informed', 'i', 'informe', 'informes'],
  doc: ['how', 'comment', 'commentaire', 'commentaires', 'details', 'detail', 'notes', 'note', 'documentation', 'mode operatoire', 'instructions'],
}

// Type de forme (colonne Type) vers élément BPMN.
const TYPES = [
  [/^(start|debut|depart|demarrage|start event|evenement de debut)/, 'bpmn:StartEvent'],
  [/^(end|fin|terminator|stop|end event|evenement de fin)/, 'bpmn:EndEvent'],
  [/^(decision|gateway|passerelle|exclusive|exclusif|choix|xor)/, 'bpmn:ExclusiveGateway'],
  [/^(parallel|parallele|fork|and)/, 'bpmn:ParallelGateway'],
  [/^(inclusive|inclusif|or)$/, 'bpmn:InclusiveGateway'],
  [/^(subprocess|sub process|sous processus|predefined process|processus predefini)/, 'bpmn:SubProcess'],
  [/^(user|utilisateur|tache utilisateur|user task)/, 'bpmn:UserTask'],
  [/^(service|automatique|automated|system|systeme|tache service|service task)/, 'bpmn:ServiceTask'],
  [/^(manual|manuel|manuelle|tache manuelle|manual task)/, 'bpmn:ManualTask'],
  [/^(script)/, 'bpmn:ScriptTask'],
  [/^(rule|business rule|regle|regle metier)/, 'bpmn:BusinessRuleTask'],
  [/^(send|envoi|envoyer)/, 'bpmn:SendTask'],
  [/^(receive|reception|recevoir)/, 'bpmn:ReceiveTask'],
  [/^(timer|delai|minuterie|attente|wait)/, 'bpmn:IntermediateCatchEvent:timer'],
]
const GATEWAYS = ['bpmn:ExclusiveGateway', 'bpmn:ParallelGateway', 'bpmn:InclusiveGateway']

function findColumns(header) {
  const cols = {}
  header.forEach((h, i) => {
    const key = fold(h)
    for (const [field, names] of Object.entries(HEADERS)) {
      if (cols[field] === undefined && names.includes(key)) { cols[field] = i; return }
    }
  })
  return cols
}

const splitList = (s) => String(s ?? '').split(/[,;|/]/).map((x) => x.trim()).filter(Boolean)

function typeOf(raw, label) {
  const key = fold(raw)
  if (key) for (const [re, type] of TYPES) if (re.test(key)) return type
  if (!key && /\?\s*$/.test(label)) return 'bpmn:ExclusiveGateway'
  return 'bpmn:Task'
}

// rows : tableau de lignes (la première est l'en-tête). T(en, fr) traduit les messages.
// Renvoie { steps, lanes, flows, errors, warnings } ; errors vide si le tableau est utilisable.
export function readTable(rows, T = (en) => en) {
  const errors = []
  const warnings = []
  if (!rows.length) return { steps: [], lanes: [], flows: [], errors: [T('The table is empty.', 'Le tableau est vide.')], warnings }
  const cols = findColumns(rows[0])
  if (cols.label === undefined) {
    return { steps: [], lanes: [], flows: [], warnings, errors: [T(
      'No column for the step names: the first row must hold the headers, with at least Description (or Process Step Description).',
      'Aucune colonne pour les noms des étapes : la première ligne doit porter les en-têtes, dont au moins Description (ou Libellé).')] }
  }
  const steps = []
  const byKey = new Map()
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    const label = (r[cols.label] || '').trim()
    const rawId = cols.id !== undefined ? (r[cols.id] || '').trim() : ''
    if (!label && !rawId) return
    const key = rawId || String(steps.length + 1)
    if (byKey.has(fold(key))) {
      errors.push(T(`Line ${line}: the identifier "${key}" is already used.`, `Ligne ${line} : l'identifiant « ${key} » est déjà pris.`))
      return
    }
    const step = {
      key, line, label,
      type: typeOf(cols.type !== undefined ? r[cols.type] : '', label),
      next: cols.next !== undefined ? splitList(r[cols.next]) : null,
      flowLabels: cols.flowLabel !== undefined ? splitList(r[cols.flowLabel]) : [],
      lane: cols.lane !== undefined ? (r[cols.lane] || '').trim() : '',
      doc: cols.doc !== undefined ? (r[cols.doc] || '').trim() : '',
      assignee: cols.assignee !== undefined ? (r[cols.assignee] || '').trim() : '',
      systems: cols.systems !== undefined ? (r[cols.systems] || '').trim() : '',
      accountable: cols.accountable !== undefined ? (r[cols.accountable] || '').trim() : '',
      consulted: cols.consulted !== undefined ? (r[cols.consulted] || '').trim() : '',
      informed: cols.informed !== undefined ? (r[cols.informed] || '').trim() : '',
    }
    steps.push(step)
    byKey.set(fold(key), step)
  })
  if (!steps.length) errors.push(T('The table has no step under its header row.', 'Le tableau n\'a aucune étape sous sa ligne d\'en-tête.'))

  // Sans colonne Étape suivante, les lignes s'enchaînent dans l'ordre.
  const flows = []
  steps.forEach((s, i) => {
    const targets = s.next === null ? (steps[i + 1] ? [steps[i + 1].key] : []) : s.next
    targets.forEach((t, j) => {
      const target = byKey.get(fold(t))
      if (!target) {
        errors.push(T(`Line ${s.line}: the next step "${t}" does not exist.`, `Ligne ${s.line} : l'étape suivante « ${t} » n'existe pas.`))
        return
      }
      flows.push({ from: s, to: target, label: s.flowLabels[j] || '' })
    })
    if (s.type === 'bpmn:EndEvent' && targets.length) {
      warnings.push(T(`Line ${s.line}: an end has no next step; its links are ignored.`, `Ligne ${s.line} : une fin n'a pas d'étape suivante, ses liens sont ignorés.`))
    }
  })
  const kept = flows.filter((f) => f.from.type !== 'bpmn:EndEvent' && f.to.type !== 'bpmn:StartEvent')
  if (flows.some((f) => f.to.type === 'bpmn:StartEvent')) {
    warnings.push(T('Links into a start are ignored.', 'Les liens qui arrivent sur un début sont ignorés.'))
  }
  const lanes = [...new Set(steps.map((s) => s.lane).filter(Boolean))]
  if (lanes.length && steps.some((s) => !s.lane)) {
    warnings.push(T('Some steps have no role: they go to a lane named "Other".', 'Certaines étapes n\'ont pas de rôle : elles vont dans un couloir « Autre ».'))
  }
  return { steps, lanes, flows: kept, errors, warnings }
}

// Construit le XML BPMN (sans partie graphique) : ajoute un début et une fin s'il en manque.
export function tableToXml(table, { name = 'Process', T = (en) => en } = {}) {
  const { steps, flows } = table
  let n = 0
  const ids = new Map()
  const prefix = { 'bpmn:StartEvent': 'Start', 'bpmn:EndEvent': 'End' }
  for (const s of steps) {
    const kind = s.type.startsWith('bpmn:IntermediateCatchEvent') ? 'Timer' : GATEWAYS.includes(s.type) ? 'Gateway' : prefix[s.type] || 'Activity'
    ids.set(s, `${kind}_${++n}`)
  }
  const all = [...steps]
  const links = flows.map((f) => ({ from: f.from, to: f.to, label: f.label }))
  const incoming = (s) => links.filter((l) => l.to === s)
  const outgoing = (s) => links.filter((l) => l.from === s)
  const otherLane = table.lanes.length && steps.some((s) => !s.lane) ? T('Other', 'Autre') : ''

  // Début ajouté devant les étapes sans entrée, fin ajoutée après les étapes sans sortie.
  if (!steps.some((s) => s.type === 'bpmn:StartEvent')) {
    const heads = steps.filter((s) => s.type !== 'bpmn:EndEvent' && !incoming(s).length)
    const first = heads.length ? heads : steps.slice(0, 1)
    const start = { label: T('Start', 'Début'), type: 'bpmn:StartEvent', lane: first[0]?.lane || '', added: true }
    ids.set(start, 'StartEvent_1')
    all.unshift(start)
    first.forEach((s) => links.push({ from: start, to: s, label: '' }))
  }
  const tails = all.filter((s) => s.type !== 'bpmn:EndEvent' && !outgoing(s).length)
  if (tails.length) {
    // Une fin déclarée sans lien entrant sert de fin commune ; sinon une fin est ajoutée.
    const loose = steps.filter((s) => s.type === 'bpmn:EndEvent' && !incoming(s).length)
    let end = loose.length === 1 ? loose[0] : null
    if (!end) {
      end = { label: T('End', 'Fin'), type: 'bpmn:EndEvent', lane: tails[tails.length - 1]?.lane || '', added: true }
      ids.set(end, 'EndEvent_1')
      all.push(end)
    }
    tails.forEach((s) => { if (s !== end) links.push({ from: s, to: end, label: '' }) })
  }

  // Plusieurs flux qui arrivent sur une activité : une passerelle de convergence les
  // réunit d'abord (sinon bpmnlint signale une jonction implicite).
  for (const s of [...all]) {
    if (GATEWAYS.includes(s.type) || s.type === 'bpmn:EndEvent') continue
    const ins = links.filter((l) => l.to === s)
    if (ins.length < 2) continue
    const merge = { label: '', type: 'bpmn:ExclusiveGateway', lane: s.lane, added: true }
    ids.set(merge, `Gateway_${++n}`)
    all.splice(all.indexOf(s), 0, merge)
    for (const l of ins) l.to = merge
    links.push({ from: merge, to: s, label: '' })
  }

  const flowIds = links.map((_, i) => `Flow_${i + 1}`)
  const xmlName = (s) => (s ? ` name="${escapeXml(s)}"` : '')
  const nodes = all.map((s) => {
    const id = ids.get(s)
    const ins = links.map((l, i) => (l.to === s ? `      <bpmn:incoming>${flowIds[i]}</bpmn:incoming>` : null)).filter(Boolean)
    const outs = links.map((l, i) => (l.from === s ? `      <bpmn:outgoing>${flowIds[i]}</bpmn:outgoing>` : null)).filter(Boolean)
    const timer = s.type === 'bpmn:IntermediateCatchEvent:timer' ? ['      <bpmn:timerEventDefinition />'] : []
    // bpmn:UserTask (type moddle) s'écrit <bpmn:userTask> dans le XML.
    const tag = s.type.replace(':timer', '').replace(/^bpmn:(\w)/, (m, c) => `bpmn:${c.toLowerCase()}`)
    const doc = s.doc ? [`      <bpmn:documentation>${escapeXml(s.doc)}</bpmn:documentation>`] : []
    const activity = /Task$|^bpmn:(callActivity|subProcess)$/i.test(tag)
    const assignee = activity ? ['assignee', 'systems', 'accountable', 'consulted', 'informed']
      .filter((k) => s[k]).map((k) => ` bpmnpilot:${k}="${escapeXml(s[k])}"`).join('') : ''
    return [`    <${tag} id="${id}"${xmlName(s.label)}${assignee}>`, ...doc, ...ins, ...outs, ...timer, `    </${tag}>`].join('\n')
  })
  const seq = links.map((l, i) =>
    `    <bpmn:sequenceFlow id="${flowIds[i]}"${xmlName(l.label)} sourceRef="${ids.get(l.from)}" targetRef="${ids.get(l.to)}" />`)

  let laneSet = ''
  const laneNames = otherLane ? [...table.lanes, otherLane] : table.lanes
  if (laneNames.length) {
    const lanes = laneNames.map((lane, i) => {
      const refs = all.filter((s) => (s.lane || otherLane) === lane).map((s) => `        <bpmn:flowNodeRef>${ids.get(s)}</bpmn:flowNodeRef>`)
      return [`      <bpmn:lane id="Lane_${i + 1}"${xmlName(lane)}>`, ...refs, '      </bpmn:lane>'].join('\n')
    })
    laneSet = ['    <bpmn:laneSet id="LaneSet_1">', ...lanes, '    </bpmn:laneSet>'].join('\n')
  }
  const process = [
    `  <bpmn:process id="Process_1"${laneNames.length ? '' : xmlName(name)} isExecutable="false">`,
    ...(laneSet ? [laneSet] : []),
    ...nodes, ...seq,
    '  </bpmn:process>',
  ].join('\n')
  const collaboration = laneNames.length
    ? `  <bpmn:collaboration id="Collaboration_1">\n    <bpmn:participant id="Participant_1"${xmlName(name)} processRef="Process_1" />\n  </bpmn:collaboration>\n`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmnpilot="https://bpmn.leylines.fr/schema/bpmn-pilot/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
${collaboration}${process}
</bpmn:definitions>
`
}

// Modèle à télécharger : en-têtes et un petit exemple, dans la langue de l'interface.
export function templateRows(T = (en) => en) {
  return [
    [T('Process Step ID', 'ID'), T('Process Step Description', 'Description'), T('Next Step ID', 'Étape suivante'),
      T('Connector Label', 'Libellé du lien'), T('Shape Type', 'Type'), T('Function', 'Fonction')],
    ['1', T('Order received', 'Commande reçue'), '2', '', T('Start', 'Début'), T('Sales', 'Ventes')],
    ['2', T('Check the order', 'Vérifier la commande'), '3', '', T('Process', 'Tâche'), T('Sales', 'Ventes')],
    ['3', T('Order complete?', 'Commande complète ?'), '4,6', T('Yes,No', 'Oui,Non'), T('Decision', 'Décision'), T('Sales', 'Ventes')],
    ['4', T('Ship the order', 'Expédier la commande'), '5', '', T('Process', 'Tâche'), T('Warehouse', 'Entrepôt')],
    ['5', T('Order shipped', 'Commande expédiée'), '', '', T('End', 'Fin'), T('Warehouse', 'Entrepôt')],
    ['6', T('Ask the customer for the missing items', 'Demander les éléments manquants au client'), '2', '', T('Process', 'Tâche'), T('Sales', 'Ventes')],
  ]
}
