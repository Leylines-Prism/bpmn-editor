// Analyse du Co-pilote IA pour le rapport de processus.
//
// L'outil set_report_commentary (chat intégré et serveur MCP) enregistre une synthèse et
// des points (goulot, chemin rare, risque, piste d'amélioration), chacun relié aux
// éléments qu'il cite. Elle vit dans le .bpmn, sous les extensions du processus ou de la
// collaboration affichés (bpmnpilot:analysis, src/bpmn-pilot-moddle.json), que les autres
// outils BPMN ignorent : elle suit le diagramme et ne se paie qu'une fois.
//
// Une empreinte de la structure (éléments, libellés, flux, probabilités, sans les positions)
// est gardée avec l'analyse : si le diagramme change ensuite, le rapport le signale.
//
// Les probabilités écrites par un outil (l'IA) portent bpmnpilot:probabilitySource="copilot"
// jusqu'à ce que quelqu'un les revoie dans le panneau Probabilité.
//
// Ce module ne dépend de rien : il tourne dans la page et dans les tests.

export const POINT_KINDS = ['bottleneck', 'rare_path', 'risk', 'improvement']
export const MAX_POINTS = 12
export const MAX_SUMMARY = 2000
export const MAX_POINT_TEXT = 600
export const AI_SOURCE = 'copilot'

const isA = (bo, type) => !!bo?.$instanceOf?.(type)

// Modèle du chat intégré pendant un tour : l'analyse enregistrée porte son nom.
let chatModel = ''
export const setChatModel = (label) => { chatModel = String(label || '') }
export const getChatModel = () => chatModel

export const isAiProbability = (flow) => (flow?.get ? flow.get('bpmnpilot:probabilitySource') : flow?.probabilitySource) === AI_SOURCE

// ── Empreinte de la structure ──

function fnv(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function walk(container, out) {
  for (const el of container.flowElements || []) {
    const parts = [el.$type, el.id, el.name || '']
    if (isA(el, 'bpmn:SequenceFlow')) parts.push(el.sourceRef?.id, el.targetRef?.id, el.get?.('bpmnpilot:probability') ?? '')
    if (el.eventDefinitions?.length) parts.push(el.eventDefinitions.map((d) => d.$type).join('+'))
    out.push(parts.join('|'))
    if (isA(el, 'bpmn:SubProcess')) walk(el, out)
  }
  for (const set of container.laneSets || []) laneRows(set, out)
}

function laneRows(set, out) {
  for (const lane of set.lanes || []) {
    out.push(['lane', lane.id, lane.name || '', (lane.flowNodeRef || []).map((r) => r.id).sort().join(',')].join('|'))
    if (lane.childLaneSet) laneRows(lane.childLaneSet, out)
  }
}

export function structureFingerprint(definitions) {
  const rows = []
  for (const root of definitions?.rootElements || []) {
    if (isA(root, 'bpmn:Process')) {
      rows.push(`process|${root.id}|${root.name || ''}`)
      walk(root, rows)
    }
    if (isA(root, 'bpmn:Collaboration')) {
      for (const p of root.participants || []) rows.push(`participant|${p.id}|${p.name || ''}|${p.processRef?.id || ''}`)
      for (const m of root.messageFlows || []) rows.push(`message|${m.id}|${m.name || ''}|${m.sourceRef?.id}|${m.targetRef?.id}`)
    }
  }
  return fnv(rows.sort().join('\n'))
}

// ── Lecture et écriture ──

// Conteneurs qui peuvent porter l'analyse : processus et collaborations.
const holders = (definitions) => (definitions?.rootElements || []).filter((r) => isA(r, 'bpmn:Process') || isA(r, 'bpmn:Collaboration'))
const analysisOf = (bo) => (bo.extensionElements?.values || []).find((v) => isA(v, 'bpmnpilot:Analysis'))

export function readAnalysis(definitions) {
  for (const holder of holders(definitions)) {
    const a = analysisOf(holder)
    if (!a) continue
    return {
      author: a.author || '',
      date: a.date || '',
      fingerprint: a.fingerprint || '',
      summary: a.summary?.text || '',
      points: (a.points || []).map((p) => ({
        kind: POINT_KINDS.includes(p.kind) ? p.kind : 'improvement',
        elements: String(p.elements || '').split(/\s+/).filter(Boolean),
        text: p.text || '',
      })),
    }
  }
  return null
}

// Changements à appliquer : pour chaque conteneur concerné, ses nouvelles extensions.
// Toute analyse existante est retirée ; la nouvelle va sur `target` (le processus ou la
// collaboration affichés). data null : retirer seulement.
export function analysisUpdates(moddle, definitions, target, data) {
  const updates = []
  for (const holder of holders(definitions)) {
    const values = holder.extensionElements?.values || []
    const kept = values.filter((v) => !isA(v, 'bpmnpilot:Analysis'))
    const add = data && holder === target
    if (kept.length === values.length && !add) continue
    const next = add ? [...kept, createAnalysis(moddle, data)] : kept
    updates.push({ bo: holder, extensionElements: next.length ? moddle.create('bpmn:ExtensionElements', { values: next }) : undefined })
  }
  if (data && !holders(definitions).includes(target)) throw new Error('No process to attach the analysis to.')
  return updates
}

function createAnalysis(moddle, { author, date, fingerprint, summary, points }) {
  const a = moddle.create('bpmnpilot:Analysis', { author, date, fingerprint })
  if (summary) a.summary = moddle.create('bpmnpilot:AnalysisText', { text: summary })
  a.points = points.map((p) => moddle.create('bpmnpilot:AnalysisPoint', { kind: p.kind, elements: (p.elements || []).join(' ') || undefined, text: p.text }))
  for (const child of [a.summary, ...a.points].filter(Boolean)) child.$parent = a
  return a
}
