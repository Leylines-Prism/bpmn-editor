// Fenêtre d'édition des décisions DMN (mode Expert, interrupteur DMN).
//
// dmn-js n'est chargé qu'à la première ouverture (import dynamique) : l'éditeur BPMN ne paie
// rien au démarrage. La fenêtre a deux usages :
//   - le modèle du diagramme ouvert (pastille d'une tâche, panneau, Ouvrir un .dmn) : à la
//     fermeture, les changements sont rangés dans le .bpmn en une seule commande (Ctrl+Z) ;
//   - un modèle de Mes diagrammes, ouvert seul : Enregistrer le met à jour, Ajouter au
//     diagramme le copie dans le diagramme ouvert.
// Le filigrane bpmn.io de dmn-js reste visible, comme le veut sa licence.

import { lang, T } from '../i18n/lang.js'
import frBpmn from '../i18n/fr.js'

let dialog = null
let current = null // { modeler, baseline, mode, onSave, onClose, ... }

async function loadDmnJs() {
  const [{ default: DmnModeler }, { default: frDmn }] = await Promise.all([
    import('dmn-js/lib/Modeler'),
    import('./dmn-fr.js'),
    import('dmn-js/dist/assets/dmn-js-shared.css'),
    import('dmn-js/dist/assets/dmn-js-drd.css'),
    import('dmn-js/dist/assets/dmn-js-decision-table.css'),
    import('dmn-js/dist/assets/dmn-js-decision-table-controls.css'),
    import('dmn-js/dist/assets/dmn-js-literal-expression.css'),
    import('dmn-js/dist/assets/dmn-js-boxed-expression.css'),
    import('dmn-js/dist/assets/dmn-js-boxed-expression-controls.css'),
    import('dmn-js/dist/assets/dmn-font/css/dmn-embedded.css'),
  ])
  const translate = (template, replacements = {}) =>
    (lang === 'fr' ? frDmn[template] ?? frBpmn[template] ?? template : template).replace(/{([^}]+)}/g, (_, k) => (k in replacements ? replacements[k] : `{${k}}`))
  const translateModule = { translate: ['value', translate] }
  return { DmnModeler, translateModule }
}

function build() {
  dialog = document.createElement('dialog')
  dialog.id = 'dmn-dialog'
  dialog.innerHTML = `
    <div class="dmn-head">
      <button type="button" class="btn" id="dmn-back" data-icon="undo"></button>
      <div class="dmn-title"><small id="dmn-subtitle"></small><h2 id="dmn-name"></h2></div>
      <div class="dmn-tabs" role="tablist">
        <button type="button" role="tab" data-view="table">${T('Decision table', 'Table de décision')}</button>
        <button type="button" role="tab" data-view="drd">${T('Requirements (DRD)', 'Exigences (DRD)')}</button>
      </div>
      <span class="dmn-grow"></span>
      <button type="button" class="btn" id="dmn-add" data-icon="new" hidden></button>
      <button type="button" class="btn" id="dmn-library" data-icon="library"></button>
      <button type="button" class="btn" id="dmn-export" data-icon="save">${T('Export .dmn', 'Exporter .dmn')}</button>
      <button type="button" class="btn icon-only dmn-close" aria-label="${T('Close', 'Fermer')}" title="${T('Close (Esc)', 'Fermer (Échap)')}">×</button>
    </div>
    <p class="dmn-status" id="dmn-status" role="status"></p>
    <div class="dmn-body" id="dmn-body"></div>`
  document.body.append(dialog)
  dialog.querySelector('.dmn-close').addEventListener('click', () => close())
  dialog.querySelector('#dmn-back').addEventListener('click', () => close())
  dialog.addEventListener('cancel', (e) => {
    // Échap pendant une saisie dans la table ferme d'abord la saisie (dmn-js), pas la fenêtre.
    if (dialog.querySelector('.dmn-body').contains(document.activeElement) && document.activeElement.matches('[contenteditable], input, select, textarea')) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    close()
  })
  for (const tab of dialog.querySelectorAll('.dmn-tabs [data-view]')) {
    tab.addEventListener('click', () => showView(tab.dataset.view))
  }
  dialog.querySelector('#dmn-export').addEventListener('click', async () => {
    if (!current) return
    const xml = await currentXml()
    current.download(xml, `${current.fileName()}.dmn`, 'application/xml')
  })
  dialog.querySelector('#dmn-library').addEventListener('click', async () => {
    if (!current?.saveToLibrary) return
    say('')
    try {
      const msg = await current.saveToLibrary(await currentXml(), current.title)
      say(msg)
      if (current.mode === 'library') current.baseline = await currentXml()
    } catch (err) {
      say(T(`Save failed: ${err.message}`, `Échec de l'enregistrement : ${err.message}`), true)
    }
  })
  dialog.querySelector('#dmn-add').addEventListener('click', async () => {
    if (!current?.addToDiagram) return
    try {
      say(await current.addToDiagram(await currentXml()))
    } catch (err) {
      say(T(`Cannot add it: ${err.message}`, `Ajout impossible : ${err.message}`), true)
    }
  })
}

function say(msg, error = false) {
  const el = dialog.querySelector('#dmn-status')
  el.textContent = msg
  el.classList.toggle('error', error)
  el.hidden = !msg
}

async function currentXml() {
  const { xml } = await current.modeler.saveXML({ format: true })
  return xml
}

function decisionViewOf(viewId) {
  return current.modeler.getViews().find((v) => v.element?.id === viewId && v.type !== 'drd')
}

async function showView(kind) {
  const modeler = current.modeler
  const views = modeler.getViews()
  let view
  if (kind === 'drd') view = views.find((v) => v.type === 'drd')
  else view = (current.decisionId && decisionViewOf(current.decisionId)) || views.find((v) => v.type === 'decisionTable') || views.find((v) => v.type !== 'drd')
  if (view) await modeler.open(view)
}

function syncTabs() {
  const view = current?.modeler.getActiveView()
  if (!view) return
  if (view.type !== 'drd') current.decisionId = view.element?.id
  const name = view.type === 'drd' ? current.title : view.element?.name || view.element?.id
  dialog.querySelector('#dmn-name').textContent = name || ''
  for (const tab of dialog.querySelectorAll('.dmn-tabs [data-view]')) {
    const on = tab.dataset.view === (view.type === 'drd' ? 'drd' : 'table')
    tab.classList.toggle('on', on)
    tab.setAttribute('aria-selected', String(on))
  }
  // Pas de table à montrer : l'onglet Table de décision ne mène nulle part.
  dialog.querySelector('.dmn-tabs [data-view="table"]').disabled = !current.modeler.getViews().some((v) => v.type !== 'drd')
}

// options : { xml, decisionId?, view?: 'table'|'drd', mode: 'diagram'|'library', title, subtitle,
//   fileName(), download(content, name, type), onSave(xml)?, saveToLibrary(xml, name)?, addToDiagram(xml)?, onClose()? }
export async function openDecisionEditor(options) {
  if (!dialog) build()
  if (current) await close()
  const { DmnModeler, translateModule } = await loadDmnJs()
  const body = dialog.querySelector('#dmn-body')
  body.replaceChildren()
  const modeler = new DmnModeler({
    container: body,
    common: { additionalModules: [translateModule] },
    drd: { additionalModules: [translateModule] },
    decisionTable: { additionalModules: [translateModule] },
    literalExpression: { additionalModules: [translateModule] },
    boxedExpression: { additionalModules: [translateModule] },
  })
  current = { ...options, modeler }
  const back = dialog.querySelector('#dmn-back')
  back.textContent = options.mode === 'library' ? T('Close', 'Fermer') : T('Back to the process', 'Retour au processus')
  back.title = options.mode === 'library'
    ? T('Close the decision model; unsaved changes are lost', 'Fermer le modèle de décision ; les changements non enregistrés sont perdus')
    : T('Close and keep the changes in the diagram (Ctrl+Z in the editor undoes them)', 'Fermer en gardant les changements dans le diagramme (Ctrl+Z dans l\'éditeur les annule)')
  dialog.querySelector('#dmn-subtitle').textContent = options.subtitle || ''
  const lib = dialog.querySelector('#dmn-library')
  lib.hidden = !options.saveToLibrary
  lib.textContent = options.mode === 'library' ? T('Save', 'Enregistrer') : T('Save to My diagrams', 'Enregistrer dans Mes diagrammes')
  lib.title = options.mode === 'library'
    ? T('Update this decision model in My diagrams', 'Mettre à jour ce modèle de décision dans Mes diagrammes')
    : T('Keep a copy of these decisions in My diagrams, to reuse them in other processes', 'Garder une copie de ces décisions dans Mes diagrammes, pour les reprendre dans d\'autres processus')
  const add = dialog.querySelector('#dmn-add')
  add.hidden = !options.addToDiagram
  add.textContent = T('Add to the open diagram', 'Ajouter au diagramme ouvert')
  add.title = T('Copy these decisions into the process open in the editor, to link them to its tasks', 'Copier ces décisions dans le processus ouvert dans l\'éditeur, pour les lier à ses tâches')
  say('')
  modeler.on('views.changed', syncTabs)
  if (!dialog.open) dialog.showModal()
  try {
    await modeler.importXML(options.xml)
  } catch (err) {
    say(T(`This decision model cannot be opened: ${err.message}`, `Ce modèle de décision ne s'ouvre pas : ${err.message}`), true)
    return
  }
  current.baseline = await currentXml()
  await showView(options.view || 'table')
  syncTabs()
}

export async function close() {
  if (!current) return
  const { modeler, baseline, mode, onSave, onClose } = current
  let xml = null
  try { xml = (await modeler.saveXML({ format: true })).xml } catch { /* modèle non chargé */ }
  const changed = xml && baseline && xml !== baseline
  if (changed && mode === 'library' && !confirm(T('Close without saving the changes to this decision model?', 'Fermer sans enregistrer les changements de ce modèle de décision ?'))) return
  current = null
  if (dialog.open) dialog.close()
  modeler.destroy()
  if (changed && mode === 'diagram' && onSave) await onSave(xml)
  onClose?.()
}

export const isDecisionEditorOpen = () => !!current
