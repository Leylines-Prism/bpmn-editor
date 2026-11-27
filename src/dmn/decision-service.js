// Service des décisions DMN du diagramme ouvert : lire le modèle rangé dans le .bpmn, l'écrire
// (une commande de bpmn-js : Ctrl+Z l'annule), lier ou délier une tâche de règle métier.
// Utilisé par l'interface (pastilles, panneau, fenêtre DMN, menus) et par les outils du
// Co-pilote IA et du serveur MCP (src/mcp-bridge.js).

import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { parseDmn, summarize, mergeDmn, addEmptyDecision, setDecisionTable, checkDecision } from './dmn-model.js'
import { readDecisionXml, decisionModelUpdates, linkProperties, decisionRefOf, resultVariable, checkLinks, RULE_TASK } from './decision-store.js'

export const DECISIONS_CHANGED = 'bpmnPilot.decisions.changed'

export function createDecisionService(modeler) {
  const canvas = modeler.get('canvas')
  const modeling = modeler.get('modeling')
  const moddle = modeler.get('moddle')
  const eventBus = modeler.get('eventBus')
  const bpmnReplace = modeler.get('bpmnReplace')
  const elementRegistry = modeler.get('elementRegistry')

  const definitions = () => modeler.getDefinitions()
  const getXml = () => readDecisionXml(definitions())

  let cache = { xml: null, summary: null }
  async function getSummary() {
    const xml = getXml()
    if (cache.xml === xml && cache.summary) return cache.summary
    let summary
    try {
      summary = await summarize(xml)
    } catch (err) {
      console.warn('Decision model unreadable:', err)
      summary = { id: '', name: '', decisions: [], inputData: [], knowledge: [], error: err.message }
    }
    cache = { xml, summary }
    return summary
  }

  // Écrit le modèle (xml vide : le retire). Une seule commande, annulable.
  function saveXml(xml) {
    const root = canvas.getRootElement()
    const updates = decisionModelUpdates(moddle, definitions(), getBusinessObject(root), xml || '')
    if (!updates.length) return
    const commandStack = modeler.get('commandStack')
    const run = () => { for (const { bo, extensionElements } of updates) modeling.updateModdleProperties(root, bo, { extensionElements }) }
    if (updates.length === 1) run()
    else {
      // Plusieurs conteneurs touchés : regroupés pour un seul Ctrl+Z.
      commandStack.execute('decisions.batch', { run })
    }
  }
  modeler.get('commandStack').register('decisions.batch', {
    preExecute: (ctx) => ctx.run(),
    execute: () => [],
    revert: () => [],
  })

  modeler.on(['commandStack.changed', 'import.done'], () => {
    if (getXml() !== cache.xml) {
      eventBus.fire(DECISIONS_CHANGED)
      getSummary() // garde un résumé à jour pour les lectures synchrones (simulation)
    }
  })
  // Résumé déjà lu, s'il correspond au modèle actuel ; null sinon.
  const cachedSummary = () => (cache.summary && cache.xml === getXml() ? cache.summary : null)

  function ruleTaskOf(elementOrId) {
    const element = typeof elementOrId === 'string' ? elementRegistry.get(elementOrId) : elementOrId
    if (!element || element.type === 'label') throw new Error(`Element not found: ${elementOrId}`)
    if (is(element, RULE_TASK)) return element
    if (element.type === 'bpmn:Task' || is(element, 'bpmn:Task')) {
      // Une tâche d'un autre type devient tâche de règle métier, comme le ferait le menu de remplacement.
      return bpmnReplace.replaceElement(element, { type: RULE_TASK })
    }
    throw new Error(`Only a task can call a decision; ${element.id} is a ${element.type.replace('bpmn:', '')}.`)
  }

  // Lien immédiat (une commande), le résumé du modèle étant déjà lu.
  function linkNow(elementOrId, decisionId, summary) {
    const decision = summary.decisions.find((d) => d.id === decisionId)
    if (decisionId && !decision) throw new Error(`Decision not found: ${decisionId}`)
    const task = ruleTaskOf(elementOrId)
    const bo = getBusinessObject(task)
    modeling.updateModdleProperties(task, bo, linkProperties(moddle, bo, decisionId || '', resultVariable(decision)))
    return task
  }

  async function link(elementOrId, decisionId) {
    return linkNow(elementOrId, decisionId, await getSummary())
  }

  // Ajoute un document DMN (fichier ouvert, Mes diagrammes) au modèle du diagramme.
  async function importDmn(xml) {
    const merged = await mergeDmn(getXml() || null, xml)
    saveXml(merged.xml)
    return merged
  }

  // Nouvelle décision avec une table vide, nommée comme la tâche, et liée à elle.
  async function createFor(element, labels) {
    const bo = getBusinessObject(element)
    const { xml, decisionId } = await addEmptyDecision(getXml() || null, { name: bo.name || 'Decision', ...labels })
    const commandStack = modeler.get('commandStack')
    let task = element
    commandStack.execute('decisions.batch', {
      run: () => {
        saveXml(xml)
        const target = ruleTaskOf(element)
        const tbo = getBusinessObject(target)
        modeling.updateModdleProperties(target, tbo, linkProperties(moddle, tbo, decisionId, 'result'))
        task = target
      },
    })
    return { decisionId, task }
  }

  async function setTable(spec) {
    const result = await setDecisionTable(getXml() || null, spec)
    saveXml(result.xml)
    return result
  }

  // Constats : chaque décision, puis les liens des tâches.
  async function check() {
    const summary = await getSummary()
    const findings = []
    if (summary.error) findings.push({ level: 'error', code: 'unreadable', text: `The decision model cannot be read: ${summary.error}` })
    for (const d of summary.decisions) for (const f of checkDecision(d)) findings.push({ ...f, decision: d.id, decisionName: d.name })
    findings.push(...checkLinks(definitions(), summary))
    return findings
  }

  return {
    getXml,
    getSummary,
    saveXml,
    link,
    linkNow,
    unlink: (element) => link(element, ''),
    importDmn,
    createFor,
    setTable,
    cachedSummary,
    check,
    decisionRefOf: (element) => decisionRefOf(getBusinessObject(element)),
    validate: parseDmn,
  }
}
