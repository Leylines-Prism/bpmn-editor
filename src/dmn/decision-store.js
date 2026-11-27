// Où le diagramme range son modèle de décision et ses liens (mode Expert, tables DMN).
//
// - Le document DMN complet est le texte d'un élément bpmnpilot:decisionModel, dans les
//   extensions du processus ou de la collaboration (src/bpmn-pilot-moddle.json). Il suit le
//   .bpmn partout : Mes diagrammes, sauvegarde automatique, export, Comparer, serveur MCP.
// - Une tâche de règle métier liée porte bpmnpilot:decisionRef="<id de la décision>" et, pour
//   que le fichier s'ouvre déjà relié dans les outils Camunda 8, l'extension
//   zeebe:calledDecision (decisionId, resultVariable).
//
// Ce module ne dépend de rien : il tourne dans la page et dans les tests.

const isA = (bo, type) => !!bo?.$instanceOf?.(type)

export const RULE_TASK = 'bpmn:BusinessRuleTask'
const holders = (definitions) => (definitions?.rootElements || []).filter((r) => isA(r, 'bpmn:Process') || isA(r, 'bpmn:Collaboration'))
const modelOf = (bo) => (bo.extensionElements?.values || []).find((v) => isA(v, 'bpmnpilot:DecisionModel'))

// Texte du document DMN du diagramme, ou '' s'il n'y en a pas.
export function readDecisionXml(definitions) {
  for (const holder of holders(definitions)) {
    const model = modelOf(holder)
    if (model?.xml?.trim()) return model.xml.trim()
  }
  return ''
}

// Conteneur qui reçoit le modèle : celui qui le porte déjà, sinon le processus ou la collaboration
// affichés, sinon le premier processus.
export function decisionHolder(definitions, shown) {
  const all = holders(definitions)
  return all.find((h) => modelOf(h)) || (all.includes(shown) ? shown : all[0]) || null
}

// Changements à appliquer pour ranger `xml` (ou retirer le modèle si xml est vide) :
// [{ bo, extensionElements }], à passer à modeling.updateModdleProperties.
export function decisionModelUpdates(moddle, definitions, shown, xml) {
  const target = xml ? decisionHolder(definitions, shown) : null
  if (xml && !target) throw new Error('No process to attach the decisions to.')
  const updates = []
  for (const holder of holders(definitions)) {
    const values = holder.extensionElements?.values || []
    const kept = values.filter((v) => !isA(v, 'bpmnpilot:DecisionModel'))
    const add = holder === target
    if (kept.length === values.length && !add) continue
    const next = add ? [...kept, moddle.create('bpmnpilot:DecisionModel', { xml })] : kept
    updates.push({ bo: holder, extensionElements: next.length ? moddle.create('bpmn:ExtensionElements', { values: next }) : undefined })
  }
  return updates
}

// ── Liens tâche → décision ──

export const decisionRefOf = (bo) => (isA(bo, RULE_TASK) ? bo.get('bpmnpilot:decisionRef') || '' : '')

const calledDecisionOf = (bo) => (bo.extensionElements?.values || []).find((v) => isA(v, 'zeebe:CalledDecision'))

// Nom de la variable résultat pour Camunda 8 : le nom de la sortie s'il n'y en a qu'une,
// sinon « result ».
export function resultVariable(decision) {
  const outputs = decision?.outputs || []
  return outputs.length === 1 && /^[A-Za-z_][\w]*$/.test(outputs[0].name || '') ? outputs[0].name : 'result'
}

// Propriétés à passer à modeling.updateModdleProperties(task, bo, …) pour lier la tâche à
// `decisionId` (ou la délier si decisionId est vide).
export function linkProperties(moddle, bo, decisionId, variable = 'result') {
  const values = (bo.extensionElements?.values || []).filter((v) => !isA(v, 'zeebe:CalledDecision'))
  if (decisionId) {
    const called = moddle.create('zeebe:CalledDecision', { decisionId, resultVariable: calledDecisionOf(bo)?.resultVariable || variable })
    values.push(called)
  }
  return {
    'bpmnpilot:decisionRef': decisionId || undefined,
    extensionElements: values.length ? moddle.create('bpmn:ExtensionElements', { values }) : undefined,
  }
}

// Toutes les tâches de règle métier du diagramme : [{ bo, decisionRef }].
export function ruleTasks(definitions) {
  const out = []
  const walk = (container) => {
    for (const el of container.flowElements || []) {
      if (isA(el, RULE_TASK)) out.push({ bo: el, decisionRef: decisionRefOf(el) || calledDecisionOf(el)?.decisionId || '' })
      if (isA(el, 'bpmn:SubProcess')) walk(el)
    }
  }
  for (const root of definitions?.rootElements || []) if (isA(root, 'bpmn:Process')) walk(root)
  return out
}

// Constats sur les liens, d'après le résumé du modèle (summarize) :
// [{ level, code, text, element }]. Une tâche liée par zeebe:calledDecision seule (fichier venu
// de Camunda) compte comme liée.
export function checkLinks(definitions, summary) {
  const known = new Set((summary?.decisions || []).map((d) => d.id))
  const out = []
  for (const { bo, decisionRef } of ruleTasks(definitions)) {
    const label = bo.name || bo.id
    if (!decisionRef) out.push({ level: 'info', code: 'unlinked', element: bo.id, text: `Business rule task "${label}" is not linked to a decision.`, fr: `La tâche de règle métier « ${label} » n'est liée à aucune décision.` })
    else if (!known.has(decisionRef)) out.push({ level: 'error', code: 'missing', element: bo.id, text: `Business rule task "${label}" points to decision ${decisionRef}, which is not in this diagram.`, fr: `La tâche de règle métier « ${label} » renvoie à la décision ${decisionRef}, absente de ce diagramme.` })
  }
  return out
}
