// Branchement des tables de décision DMN dans l'éditeur (mode Expert, interrupteur DMN) :
// service, pastilles et panneau, fenêtre DMN, menus Ouvrir et Exporter, Mes diagrammes.

import { T } from '../i18n/lang.js'
import { createDecisionService } from './decision-service.js'
import { setupDecisionLinks } from './decision-links.js'
import { openDecisionEditor } from './decision-editor.js'
import { setupDmnSwitch, setDmn } from './dmn-switch.js'

export function setupDecisions({ modeler, library, download, baseName, setStatus, askCopilot }) {
  const service = createDecisionService(modeler)
  const elementRegistry = modeler.get('elementRegistry')
  const fileInput = document.getElementById('dmn-input')
  let libraryRef = null // dernier enregistrement des décisions du diagramme dans Mes diagrammes
  modeler.on('import.done', () => { libraryRef = null })

  const fileName = () => `${baseName()} - ${T('decisions', 'décisions')}`
  const nameOf = (element) => (element?.businessObject?.name || element?.id || '').trim()

  async function open({ decisionId, task, view } = {}) {
    const xml = service.getXml()
    if (!xml) return
    const summary = await service.getSummary()
    await openDecisionEditor({
      xml,
      decisionId,
      view: view || (decisionId ? 'table' : 'drd'),
      mode: 'diagram',
      title: summary.name || T('Decisions', 'Décisions'),
      subtitle: task ? T(`Decision called by “${nameOf(task)}”`, `Décision appelée par « ${nameOf(task)} »`) : T(`Decisions of “${baseName()}”`, `Décisions de « ${baseName()} »`),
      fileName,
      download,
      onSave: (next) => {
        service.saveXml(next)
        setStatus(T('Decisions saved in the diagram', 'Décisions rangées dans le diagramme'))
      },
      saveToLibrary: async (current) => {
        const saved = await library.saveDecisionModel({ ref: libraryRef, name: fileName(), xml: current })
        libraryRef = { place: saved.place, id: saved.id }
        return saved.message
      },
    })
  }

  // Ajoute un document DMN au diagramme ; lie la tâche à sa première décision si on en donne une.
  async function addToDiagram(xml, task) {
    const merged = await service.importDmn(xml)
    if (task && merged.decisions.length) await service.link(elementRegistry.get(task.id) || task, merged.decisions[0])
    const renamed = Object.keys(merged.renamed).length
    return { merged, message: T(
      `${merged.decisions.length} decision(s) added to the diagram${renamed ? `, ${renamed} id(s) renamed to stay unique` : ''}.`,
      `${merged.decisions.length} décision(s) ajoutée(s) au diagramme${renamed ? `, ${renamed} id renommé(s) pour rester uniques` : ''}.`) }
  }

  let pendingTask = null
  function importFileFor(task) {
    pendingTask = task || null
    fileInput.click()
  }
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    const task = pendingTask
    pendingTask = null
    if (file) await importDmnFile(file, task)
  })

  async function importDmnFile(file, task = null) {
    try {
      const { merged, message } = await addToDiagram(await file.text(), task)
      setDmn(true)
      setStatus(message)
      await open({ decisionId: task ? merged.decisions[0] : undefined, task, view: task ? 'table' : 'drd' })
    } catch (err) {
      alert(T('This .dmn file cannot be opened: ', 'Ce fichier .dmn ne s\'ouvre pas : ') + err.message)
    }
  }

  async function importFromLibrary(row, task) {
    const item = await library.getItem(row)
    if (!item) throw new Error(T('this decision model no longer exists', 'ce modèle de décision n\'existe plus'))
    const { merged, message } = await addToDiagram(item.xml, task)
    if (task && merged.decisions.length) await open({ decisionId: merged.decisions[0], task })
    return message
  }

  // Modèle ouvert depuis Mes diagrammes, seul.
  function openDecisionModel(item) {
    setDmn(true)
    let ref = { place: item.place, id: item.id }
    return openDecisionEditor({
      xml: item.xml,
      view: 'drd',
      mode: 'library',
      title: item.name,
      subtitle: T('Decision model in My diagrams', 'Modèle de décision de Mes diagrammes'),
      fileName: () => item.name,
      download,
      saveToLibrary: async (xml) => {
        const saved = await library.saveDecisionModel({ ref, name: item.name, xml })
        ref = { place: saved.place, id: saved.id }
        return saved.message
      },
      addToDiagram: async (xml) => (await addToDiagram(xml)).message,
    })
  }

  const links = setupDecisionLinks(modeler, {
    service,
    open,
    importFileFor,
    importFromLibrary,
    listLibraryModels: () => library.listDecisionModels(),
    labels: () => ({ inputLabel: T('Input', 'Entrée'), outputLabel: T('Output', 'Sortie') }),
    copilotReady: () => !document.getElementById('btn-ai-probabilities')?.disabled,
    askCopilot: (task) => askCopilot(T(
      `Write the DMN decision table of the business rule task ${task.id} ("${nameOf(task)}"), from its label, its documentation and the rest of the process. ` +
        'Use set_decision_table with linkTo set to this task: name the inputs and outputs in business words, give the allowed values of text inputs and outputs, ' +
        'choose the hit policy, and write rules that do not overlap unless the policy allows it. Then sum up the table in a few lines and say what the user must confirm.',
      `Rédige la table de décision DMN de la tâche de règle métier ${task.id} (« ${nameOf(task)} »), d'après son libellé, sa documentation et le reste du processus. ` +
        'Utilise set_decision_table avec linkTo sur cette tâche : nomme les entrées et sorties en termes métier, donne les valeurs prévues des entrées et sorties texte, ' +
        'choisis la politique de résultat, et écris des règles qui ne se chevauchent pas, sauf si la politique le permet. Résume ensuite la table en quelques lignes et dis ce que l\'utilisateur doit confirmer.')),
    showPanelGroup: () => {
      const toggle = document.getElementById('btn-properties')
      if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click()
    },
  })

  setupDmnSwitch(document.getElementById('btn-dmn'))
  document.getElementById('btn-open-dmn').addEventListener('click', () => importFileFor(null))
  document.getElementById('btn-save-dmn').addEventListener('click', () => {
    const xml = service.getXml()
    if (!xml) {
      alert(T('This diagram has no decision yet: create one from a business rule task.', 'Ce diagramme n\'a pas encore de décision : créez-en une depuis une tâche de règle métier.'))
      return
    }
    download(xml, `${fileName()}.dmn`, 'application/xml')
  })
  document.getElementById('btn-dmn-drd').addEventListener('click', () => {
    if (!service.getXml()) {
      alert(T('This diagram has no decision yet: create one from a business rule task.', 'Ce diagramme n\'a pas encore de décision : créez-en une depuis une tâche de règle métier.'))
      return
    }
    open({ view: 'drd' })
  })

  // Pour le rapport de processus : décisions, tâches qui les appellent, constats. null sans décision
  // ni tâche de règle métier.
  async function report() {
    const summary = await service.getSummary()
    const findings = await service.check()
    const calls = {}
    for (const el of elementRegistry.filter((e) => e.type === 'bpmn:BusinessRuleTask')) {
      const ref = service.decisionRefOf(el)
      if (ref) (calls[ref] ||= []).push({ id: el.id, name: nameOf(el) })
    }
    if (!summary.decisions.length && !findings.length) return null
    return { summary, findings, calls }
  }

  return { service, open, openDecisionModel, importDmnFile, report, links }
}
