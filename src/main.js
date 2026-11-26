// En premier : refuse de démarrer dans le cadre d'un autre site (voir frame-guard.js).
import './frame-guard.js'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel'
import minimapModule from 'diagram-js-minimap'
import TokenSimulationModule from 'bpmn-js-token-simulation'
import { CreateAppendAnythingModule } from 'bpmn-js-create-append-anything'
import BpmnColorPickerModule from 'bpmn-js-color-picker'
import { COLORS, CustomColorModule } from './color-palette.js'
import { LabelStyleModule } from './label-style.js'
import { AppearancePanelModule } from './appearance-panel.js'
import NativeCopyPasteModule from 'bpmn-js-native-copy-paste'
import LintModule from 'bpmn-js-bpmnlint'
import GridModule from 'diagram-js-grid'
import { CopyAsImageModule } from 'bpmn-js-copy-as-image'
import lintConfig from './packed-lint-config.js'
import { LintProcessBadgeModule } from './lint-process-badge.js'
import TranslateModule from './i18n/translate.js'
import { lang, T } from './i18n/lang.js'
import { translatePanelTitles } from './i18n/panel-titles.js'
import { setupPanelPopup } from './panel-popup.js'
import { applyStaticTexts } from './i18n/static-texts.js'
import { autoLayout } from './auto-layout.js'
import { importDiagram, setupXmlDialog, setupXmlExport, setupFileDrop } from './import-xml.js'
import { EXPORT_FORMATS, exportSize, hasShapes, renderExport } from './export-files.js'
import { createExportOffer } from './export-offer.js'
import { setupExportDestination } from './export-destination.js'
import { printDiagram } from './print-diagram.js'
import { setupHistory } from './history.js'

import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import '@bpmn-io/properties-panel/assets/properties-panel.css'
import 'diagram-js-minimap/assets/diagram-js-minimap.css'
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css'
import 'bpmn-js-color-picker/colors/color-picker.css'
import 'bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css'
import '@fontsource/urbanist/400.css'
import '@fontsource/urbanist/500.css'
import '@fontsource/urbanist/600.css'
import './brand/tokens.css'
import './theme/leylines.css'
import { setupThemeToggle } from './theme/theme-toggle.js'
import { setupBrandLogo } from './theme/brand-logo.js'
import { setupPanelToggle } from './panel-toggle.js'
import { setupPresentation } from './presentation.js'
import { setupSimulationSpeed } from './simulation-speed.js'
import { setupSmallScreenNotice } from './small-screen.js'
import { makeResizable } from './panel-resize.js'
import { fitView } from './fit-view.js'
import { setupDeepLink } from './deep-link.js'
import { setupDiagramLibrary } from './diagram-library.js'
import { setupFeedback } from './feedback.js'
import { setupAnalytics, track } from './analytics.js'
import { APP_VERSION, IS_DEV_SITE, OTHER_SITE } from './site-channel.js'

const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1" name="${T('Start', 'Début')}">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <task id="Task_1" name="${T('Task', 'Tâche')}">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </task>
    <endEvent id="EndEvent_1" name="${T('End', 'Fin')}">
      <incoming>Flow_2</incoming>
    </endEvent>
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
    <sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="145" y="125" width="50" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="250" y="60" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="412" y="82" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="409" y="125" width="43" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100"/><di:waypoint x="250" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="350" y="100"/><di:waypoint x="412" y="100"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`

const LS_KEY = 'bpmn-editor-autosave'
const DEFAULT_NAME = T('diagram', 'diagramme')
const NAME_KEY = 'bpmn-editor-filename'

// Nom de base (sans extension) de l'enregistrement et des exports. Il se règle
// dans le champ de la barre d'outils, prérempli avec le nom du fichier ouvert,
// et il est retenu avec la sauvegarde automatique.
const nameInput = document.getElementById('file-name')

function cleanName(value) {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '') // caractères refusés dans un nom de fichier
    .replace(/\.(bpmn|xml|svg|png|pdf)$/i, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
}
function baseName() {
  return cleanName(nameInput.value) || DEFAULT_NAME
}
function rememberName() {
  try { localStorage.setItem(NAME_KEY, baseName()) } catch {}
}
function setBaseName(name) {
  nameInput.value = cleanName(name) || DEFAULT_NAME
  rememberName()
}
nameInput.addEventListener('input', rememberName)
nameInput.addEventListener('change', () => { nameInput.value = baseName() })
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Escape') nameInput.blur()
})

const modeler = new BpmnModeler({
  container: '#canvas',
  propertiesPanel: { parent: '#properties-panel' },
  linting: { bpmnlint: lintConfig, active: true },
  colorPicker: { colors: COLORS },
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    minimapModule,
    TokenSimulationModule,
    CreateAppendAnythingModule,
    BpmnColorPickerModule,
    CustomColorModule,
    LabelStyleModule,
    AppearancePanelModule,
    NativeCopyPasteModule,
    LintModule,
    LintProcessBadgeModule,
    GridModule,
    CopyAsImageModule,
    ...(lang === 'fr' ? [TranslateModule] : []),
  ],
})

setupDeepLink(modeler)
setupHistory({
  modeler,
  undoButton: document.getElementById('btn-undo'),
  redoButton: document.getElementById('btn-redo'),
})

async function loadInitial() {
  const saved = localStorage.getItem(LS_KEY)
  let savedName = null
  try { savedName = localStorage.getItem(NAME_KEY) } catch {}
  nameInput.value = (saved && savedName && cleanName(savedName)) || DEFAULT_NAME
  try {
    await modeler.importXML(saved || EMPTY_DIAGRAM)
    fitView(modeler.get('canvas'))
    setStatus(saved ? T('previous work restored', 'travail précédent restauré') : T('New diagram', 'Nouveau diagramme'))
  } catch (e) {
    console.error('Import error:', e)
    await modeler.importXML(EMPTY_DIAGRAM)
    fitView(modeler.get('canvas'))
  }
}

let saveTimer = null
function setStatus(msg) {
  document.getElementById('autosave-status').textContent = T('Autosave: ', 'Sauvegarde auto : ') + msg
}

async function autosave({ quiet = false } = {}) {
  try {
    const { xml } = await modeler.saveXML({ format: true })
    localStorage.setItem(LS_KEY, xml)
    if (!quiet) setStatus(new Date().toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US'))
  } catch { setStatus(T('error', 'erreur')) }
}

// Modifications non enregistrées dans « Mes diagrammes ».
let dirty = false

modeler.on(['commandStack.changed', 'layout.done', 'history.restored'], () => {
  dirty = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(autosave, 1000)
})

document.getElementById('btn-new').addEventListener('click', async () => {
  if (!confirm(T('Create a new diagram? The current diagram will be lost if it has not been saved.', 'Créer un nouveau diagramme ? Le diagramme actuel sera perdu si non sauvegardé.'))) return
  localStorage.removeItem(LS_KEY)
  library.unlink()
  dirty = false
  setBaseName(DEFAULT_NAME)
  await modeler.importXML(EMPTY_DIAGRAM)
  fitView(modeler.get('canvas'))
  setStatus(T('New', 'Nouveau'))
  track('nouveau-diagramme')
})

document.getElementById('btn-open').addEventListener('click', () => {
  document.getElementById('file-input').click()
})

// Import commun au bouton Ouvrir, au glisser-déposer et à la fenêtre Importer XML.
// Renvoie un message d'erreur, ou rien si l'import a réussi.
async function importAndReport(xml, fileName) {
  try {
    const { warnings, laidOut } = await importDiagram(modeler, xml)
    library.unlink()
    setBaseName(fileName ? fileName.replace(/\.(bpmn|xml)$/i, '') : DEFAULT_NAME)
    // Le diagramme ouvert est sauvegardé tout de suite, avec son nom : un
    // rechargement de la page le retrouve même sans modification.
    clearTimeout(saveTimer)
    await autosave({ quiet: true }) // garde le message d'import dans la barre
    let status = fileName ? T('File opened', 'Fichier ouvert') : T('XML imported', 'XML importé')
    if (laidOut) status += T(', laid out automatically (no diagram layout in the file)', ', rangé automatiquement (pas de partie graphique)')
    if (warnings.length) {
      status += ', ' + warnings.length + (warnings.length > 1 ? T(' warnings', ' avertissements') : T(' warning', ' avertissement')) + T(' (see the console)', ' (voir la console)')
      console.warn('Avertissements d\'import :', warnings)
    }
    setStatus(status)
  } catch (err) {
    return err.message
  }
}

async function importFile(file) {
  if (!/\.(bpmn|xml)$/i.test(file.name)) {
    alert(T('Unsupported format: choose a .bpmn or .xml file.', 'Format non pris en charge : choisissez un fichier .bpmn ou .xml.'))
    return
  }
  const failure = await importAndReport(await file.text(), file.name)
  if (failure) alert(T('Import failed: ', 'Import impossible : ') + failure)
  else track('fichier-ouvert', { source: 'fichier' })
}

document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  e.target.value = ''
  if (file) await importFile(file)
})

setupXmlDialog({
  openButton: document.getElementById('btn-import-xml'),
  fileInput: document.getElementById('file-input'),
  onImport: async (xml) => {
    const failure = await importAndReport(xml, null)
    if (!failure) track('fichier-ouvert', { source: 'xml' })
    return failure
  },
})
setupFileDrop({ onFile: importFile })

// Ouvrir > Comparer avec un fichier : le fichier choisi à gauche, le diagramme ouvert à droite.
document.getElementById('btn-compare-file').addEventListener('click', () => {
  document.getElementById('compare-input').click()
})
document.getElementById('compare-input').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (!/\.(bpmn|xml)$/i.test(file.name)) {
    alert(T('Unsupported format: choose a .bpmn or .xml file.', 'Format non pris en charge : choisissez un fichier .bpmn ou .xml.'))
    return
  }
  const { xml } = await modeler.saveXML({ format: true })
  const { openCompare } = await import('./compare.js')
  await openCompare({
    title: T('Compare', 'Comparer'),
    before: { xml: await file.text(), title: file.name },
    after: { xml, title: T('Open diagram', 'Diagramme ouvert') + ' · ' + baseName() },
  })
})

// Adresse du serveur mcp/ (pont, chat, diagrammes) : en développement, dans l'image
// docker (adresse relative « /bridge », relayée par nginx), ou VITE_MCP_BRIDGE_URL.
// Pas de serveur dans la version en ligne.
const configuredBridge = import.meta.env.MODE === 'online'
  ? ''
  : import.meta.env.VITE_MCP_BRIDGE_URL || (import.meta.env.DEV ? 'ws://127.0.0.1:3333/bridge' : '')
const mcpBridgeUrl = configuredBridge.startsWith('/')
  ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${configuredBridge}`
  : configuredBridge

const library = setupDiagramLibrary({
  button: document.getElementById('btn-library'),
  getXml: async () => (await modeler.saveXML({ format: true })).xml,
  getName: baseName,
  setName: setBaseName,
  openXml: (xml, name) => importAndReport(xml, name),
  setStatus: (msg) => { document.getElementById('autosave-status').textContent = msg },
  isDirty: () => dirty,
  markClean: () => { dirty = false },
  serverUrl: mcpBridgeUrl ? mcpBridgeUrl.replace(/^ws/, 'http').replace(/\/bridge$/, '/diagrams') : null,
})

// Version docker : le menu Exporter peut aussi déposer les fichiers dans le dossier du serveur.
const { deliver, sendToServer } = setupExportDestination({
  menu: document.getElementById('export-menu'),
  exportsUrl: mcpBridgeUrl ? mcpBridgeUrl.replace(/^ws/, 'http').replace(/\/bridge$/, '/exports') : null,
  download,
  setStatus: (msg) => { document.getElementById('autosave-status').textContent = msg },
})

// Entrées du menu Exporter qui produisent un fichier : même rendu que l'outil export_diagram.
async function exportFile(format) {
  const { content, ext, type } = await renderExport(modeler, format)
  await deliver(content, baseName(), ext, type)
  track('export', { format })
}

document.getElementById('btn-save').addEventListener('click', () => exportFile('bpmn'))

// Menus Ouvrir et Exporter : ouverts sous leur bouton, refermés dès qu'une entrée est choisie.
for (const menu of document.querySelectorAll('#toolbar .menu[popover]')) {
  const anchor = document.querySelector(`[popovertarget="${menu.id}"]`)
  menu.addEventListener('beforetoggle', (e) => {
    if (e.newState !== 'open') return
    const r = anchor.getBoundingClientRect()
    menu.style.left = r.left + 'px'
    menu.style.top = (r.bottom + 4) + 'px'
  })
  menu.addEventListener('click', (e) => {
    if (e.target.closest('button')) menu.hidePopover()
  })
}

document.getElementById('btn-save-xml').addEventListener('click', () => exportFile('xml'))

setupXmlExport({
  openButton: document.getElementById('btn-xml'),
  getXml: async () => (await modeler.saveXML({ format: true })).xml,
  download: (xml) => {
    download(xml, baseName() + '.xml', 'application/xml')
    track('export', { format: 'xml' })
  },
})

document.getElementById('btn-svg').addEventListener('click', () => exportFile('svg'))

document.getElementById('btn-png').addEventListener('click', async () => {
  try {
    await exportFile('png')
  } catch {
    alert(T('PNG export unavailable, use the SVG export.', 'Export PNG indisponible, utilise Export SVG.'))
  }
})

document.getElementById('btn-pdf').addEventListener('click', async (e) => {
  const button = e.currentTarget
  button.disabled = true
  try {
    if (!hasShapes(modeler)) throw new Error(T('the diagram is empty', 'le diagramme est vide'))
    await exportFile('pdf')
  } catch (err) {
    console.error('PDF export error:', err)
    alert(T('PDF export failed: ', 'Export PDF impossible : ') + err.message)
  } finally {
    button.disabled = false
  }
})

// Outil export_diagram (serveur MCP et chat intégré) : le fichier est produit ici,
// déposé dans le dossier exports du serveur s'il y en a un, et proposé dans une
// bannière du canevas. Il ne se télécharge que sur un clic de l'utilisateur.
const exportOffer = createExportOffer({ container: document.getElementById('canvas'), download })

async function exportForAi({ format, name }) {
  if (!EXPORT_FORMATS.includes(format)) throw new Error(`Unknown format: ${format}. Use one of: ${EXPORT_FORMATS.join(', ')}.`)
  if (format !== 'bpmn' && !hasShapes(modeler)) throw new Error('The diagram is empty: nothing to export.')
  const base = (name !== undefined ? cleanName(name) : '') || baseName()
  let file
  try {
    file = await renderExport(modeler, format)
  } catch (err) {
    throw new Error(err.message === 'png-unavailable' ? 'The browser could not draw the diagram as a PNG image.' : `Export failed: ${err.message}`, { cause: err })
  }
  const bytes = exportSize(file.content)
  let saved = null
  let serverError = null
  if (sendToServer) {
    try {
      saved = await sendToServer(file.content, base, file.ext)
    } catch (err) {
      // Le fichier est produit : la bannière Télécharger reste proposée, et l'outil le dit.
      serverError = err.message
    }
  }
  exportOffer.show({ content: file.content, filename: saved || `${base}.${file.ext}`, type: file.type, savedOnServer: !!saved })
  return {
    format,
    bytes,
    ...(saved ? { savedOnServer: `exports/${saved}` } : {}),
    ...(serverError ? { serverSaveFailed: serverError } : {}),
    downloadOffered: true,
    note: saved
      ? 'Saved in the exports folder of the server. The editor also shows a Download button: the file is downloaded only if the user clicks it.'
      : serverError
        ? `The file could not be saved on the server (${serverError}). Tell the user. The editor still shows a Download button: the file is downloaded only if the user clicks it.`
        : 'The editor shows a Download button: the file is downloaded only if the user clicks it.',
  }
}

document.getElementById('btn-print').addEventListener('click', async () => {
  try {
    await printDiagram(modeler, { title: baseName() })
  } catch (err) {
    if (err.message === 'empty') {
      alert(T('Nothing to print: the diagram is empty.', 'Rien à imprimer : le diagramme est vide.'))
      return
    }
    console.error('Print error:', err)
    alert(T('Printing failed: ', 'Impression impossible : ') + err.message)
  }
})

document.getElementById('btn-layout').addEventListener('click', async () => {
  if (!confirm(T('Tidy up the diagram automatically? All positions will be recalculated. Undo (Ctrl+Z) brings back the previous layout.', 'Ranger le diagramme automatiquement ? Toutes les positions seront recalculées. Annuler (Ctrl+Z) ramène la disposition d\'avant.'))) return
  try {
    await autoLayout(modeler)
    setStatus(T('Diagram tidied up', 'Diagramme rangé'))
  } catch (err) {
    console.error('Layout error:', err)
    alert(T('Layout failed: ', 'Mise en page impossible : ') + err.message)
  }
})

// Le bouton suit l'état réel de la simulation : on pilote le service de
// l'extension, et l'événement qu'elle émet met à jour le libellé, que la
// bascule vienne de ce bouton ou du contrôle intégré au canevas.
const simButton = document.getElementById('btn-simulation')
modeler.on('tokenSimulation.toggleMode', ({ active }) => {
  simButton.textContent = active ? T('Stop simulation', 'Arrêter la simulation') : 'Simulation'
  simButton.classList.toggle('active', !!active)
})
simButton.addEventListener('click', () => {
  modeler.get('toggleMode').toggleMode()
})

function download(content, filename, type) {
  const a = document.createElement('a')
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

setupThemeToggle(document.getElementById('btn-theme'))
applyStaticTexts(() => { clearTimeout(saveTimer); return autosave({ quiet: true }) })
// Le logo de la barre ouvre la page vitrine Leylines dans un nouvel onglet (index.html) :
// le diagramme en cours et son historique d'annulation restent intacts.
document.querySelector('.brand-logo')?.setAttribute('aria-label', T('Leylines (opens in a new tab)', 'Leylines (ouvre un nouvel onglet)'))
setupBrandLogo()
setupPanelToggle({
  button: document.getElementById('btn-properties'),
  panel: document.getElementById('properties-panel'),
  canvas: modeler.get('canvas'),
})
setupSmallScreenNotice({ before: document.getElementById('main'), canvas: modeler.get('canvas') })
setupPresentation({ button: document.getElementById('btn-present'), modeler })
setupSimulationSpeed(modeler)

// Poignée pour régler la largeur du panneau Processus.
translatePanelTitles(document.getElementById('properties-panel'))
setupPanelPopup(modeler.get('eventBus'))
makeResizable(document.getElementById('properties-panel'), {
  name: 'properties', label: T('Process panel width', 'Largeur du panneau Processus'), min: 240, max: 640, fallback: 300,
})
loadInitial().then(() => { dirty = false })

// Chat intégré, en deux modes :
//   - en ligne (build « vite build --mode online ») : le chat tourne dans la page et
//     appelle le fournisseur réglé dans Options. Pas de pont MCP.
//   - serveur (développement, image docker, ou VITE_MCP_BRIDGE_URL définie au build) : pont vers le
//     serveur MCP (dossier mcp/), qui fait tourner le chat (route /chat).
// Lien « Feedback », en bas du canevas (adresses réglées au build).
const feedback = setupFeedback({ container: document.getElementById('canvas') })
// Image docker lancée avec SHOWCASE=off (voir nginx.conf.template) : pas de page vitrine,
// le logo de la barre ouvre la fenêtre « Votre avis » à la place.
if (import.meta.env.MODE !== 'online' && !import.meta.env.DEV && feedback) {
  fetch('showcase.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((config) => {
      const logo = document.querySelector('.brand-logo')
      if (config?.showcase !== 'off' || !logo) return
      for (const name of ['href', 'target', 'rel']) logo.removeAttribute(name)
      logo.setAttribute('role', 'button')
      logo.tabIndex = 0
      logo.title = T('Feedback', 'Votre avis')
      logo.setAttribute('aria-label', T('Feedback', 'Votre avis'))
      logo.addEventListener('click', (e) => { e.preventDefault(); feedback.open() })
      logo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); feedback.open() }
      })
    })
    .catch(() => {})
}
// Page de développement en ligne : une pastille à côté du titre le dit, et mène à la page stable.
if (IS_DEV_SITE) {
  const badge = document.createElement(OTHER_SITE ? 'a' : 'span')
  badge.className = 'channel-badge'
  if (OTHER_SITE) badge.href = OTHER_SITE
  badge.textContent = 'Dev'
  badge.title = T(
    `Development version ${APP_VERSION}: it follows the latest changes and keeps its own diagrams and settings. Click to open the stable version.`,
    `Version de développement ${APP_VERSION} : elle suit les dernières modifications et garde ses propres diagrammes et réglages. Cliquez pour ouvrir la version stable.`,
  )
  document.querySelector('#toolbar .brand').append(badge)
}
// Version, dans un petit encadré discret en bas à gauche du canevas.
if (APP_VERSION) {
  const version = document.createElement('div')
  version.id = 'app-version'
  version.textContent = APP_VERSION
  version.title = T('BPMN-Pilot version', 'Version de BPMN-Pilot')
  document.getElementById('canvas').append(version)
}
if (import.meta.env.MODE === 'online') {
  // Mesure d'audience, si Umami est réglé au build (voir src/analytics.js). Pas sur la page de
  // développement : seule la page stable est mesurée.
  if (!IS_DEV_SITE) setupAnalytics()
  // Bouton « Confidentialité », en bas à droite du canevas.
  import('./privacy.js').then(({ setupPrivacy }) => setupPrivacy({ container: document.getElementById('canvas') }))
  Promise.all([import('./mcp-bridge.js'), import('./chat-panel.js')]).then(([{ createTools }, { createChatPanel }]) => {
    createChatPanel({ mode: 'online', tools: createTools(modeler, { exportDiagram: exportForAi }) })
  })
} else {
  if (mcpBridgeUrl) {
    Promise.all([import('./mcp-bridge.js'), import('./chat-panel.js'), import('./mcp-connect.js')]).then(([{ connectMcpBridge }, { createChatPanel }, { setupMcpConnect }]) => {
      const bridge = connectMcpBridge(modeler, mcpBridgeUrl, { exportDiagram: exportForAi })
      // Le chat intégré passe par le même serveur, route /chat.
      const chatUrl = mcpBridgeUrl.replace(/^ws/, 'http').replace(/\/bridge$/, '/chat')
      createChatPanel({ mode: 'server', chatUrl, bridge })
      // Clic sur le badge MCP : adresse et configurations pour connecter un agent.
      const mcpUrl = mcpBridgeUrl.replace(/^ws/, 'http').replace(/\/bridge$/, '/mcp')
      setupMcpConnect({ badge: bridge.badge, mcpUrl, infoUrl: chatUrl })
    })
  }
}
