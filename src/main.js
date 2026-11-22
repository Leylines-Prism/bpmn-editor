import BpmnModeler from 'bpmn-js/lib/Modeler'
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel'
import minimapModule from 'diagram-js-minimap'
import TokenSimulationModule from 'bpmn-js-token-simulation'
import { CreateAppendAnythingModule } from 'bpmn-js-create-append-anything'
import BpmnColorPickerModule from 'bpmn-js-color-picker'
import NativeCopyPasteModule from 'bpmn-js-native-copy-paste'
import LintModule from 'bpmn-js-bpmnlint'
import GridModule from 'diagram-js-grid'
import { CopyAsImageModule } from 'bpmn-js-copy-as-image'
import lintConfig from './packed-lint-config.js'
import TranslateModule from './i18n/translate.js'
import { autoLayout } from './auto-layout.js'
import { importDiagram, setupXmlDialog, setupXmlExport, setupFileDrop } from './import-xml.js'
import { exportPdf } from './export-pdf.js'

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
import '../design/leylines/tokens.css'
import './theme/leylines.css'
import { setupThemeToggle } from './theme/theme-toggle.js'
import { setupPanelToggle } from './panel-toggle.js'

const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1" name="Début">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <task id="Task_1" name="Tâche">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </task>
    <endEvent id="EndEvent_1" name="Fin">
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
const DEFAULT_NAME = 'diagramme'
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
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    minimapModule,
    TokenSimulationModule,
    CreateAppendAnythingModule,
    BpmnColorPickerModule,
    NativeCopyPasteModule,
    LintModule,
    GridModule,
    CopyAsImageModule,
    TranslateModule,
  ],
})

async function loadInitial() {
  const saved = localStorage.getItem(LS_KEY)
  let savedName = null
  try { savedName = localStorage.getItem(NAME_KEY) } catch {}
  nameInput.value = (saved && savedName && cleanName(savedName)) || DEFAULT_NAME
  try {
    await modeler.importXML(saved || EMPTY_DIAGRAM)
    modeler.get('canvas').zoom('fit-viewport')
    setStatus(saved ? 'Reprise auto-save' : 'Nouveau diagramme')
  } catch (e) {
    console.error('Import error:', e)
    await modeler.importXML(EMPTY_DIAGRAM)
    modeler.get('canvas').zoom('fit-viewport')
  }
}

let saveTimer = null
function setStatus(msg) {
  document.getElementById('autosave-status').textContent = 'Sauvegarde auto : ' + msg
}

async function autosave({ quiet = false } = {}) {
  try {
    const { xml } = await modeler.saveXML({ format: true })
    localStorage.setItem(LS_KEY, xml)
    if (!quiet) setStatus(new Date().toLocaleTimeString())
  } catch (e) { setStatus('erreur') }
}

modeler.on('commandStack.changed', () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(autosave, 1000)
})

document.getElementById('btn-new').addEventListener('click', async () => {
  if (!confirm('Créer un nouveau diagramme ? Le diagramme actuel sera perdu si non sauvegardé.')) return
  localStorage.removeItem(LS_KEY)
  setBaseName(DEFAULT_NAME)
  await modeler.importXML(EMPTY_DIAGRAM)
  modeler.get('canvas').zoom('fit-viewport')
  setStatus('Nouveau')
})

document.getElementById('btn-open').addEventListener('click', () => {
  document.getElementById('file-input').click()
})

// Import commun au bouton Ouvrir, au glisser-déposer et à la fenêtre Importer XML.
// Renvoie un message d'erreur, ou rien si l'import a réussi.
async function importAndReport(xml, fileName) {
  try {
    const { warnings, laidOut } = await importDiagram(modeler, xml)
    setBaseName(fileName ? fileName.replace(/\.(bpmn|xml)$/i, '') : DEFAULT_NAME)
    // Le diagramme ouvert est sauvegardé tout de suite, avec son nom : un
    // rechargement de la page le retrouve même sans modification.
    clearTimeout(saveTimer)
    await autosave({ quiet: true }) // garde le message d'import dans la barre
    let status = fileName ? 'Fichier ouvert' : 'XML importé'
    if (laidOut) status += ', rangé automatiquement (pas de partie graphique)'
    if (warnings.length) {
      status += ', ' + warnings.length + (warnings.length > 1 ? ' avertissements' : ' avertissement') + ' (voir la console)'
      console.warn('Avertissements d\'import :', warnings)
    }
    setStatus(status)
  } catch (err) {
    return err.message
  }
}

async function importFile(file) {
  if (!/\.(bpmn|xml)$/i.test(file.name)) {
    alert('Format non pris en charge : choisis un fichier .bpmn ou .xml.')
    return
  }
  const failure = await importAndReport(await file.text(), file.name)
  if (failure) alert('Import impossible : ' + failure)
}

document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  e.target.value = ''
  if (file) await importFile(file)
})

setupXmlDialog({
  openButton: document.getElementById('btn-import-xml'),
  fileInput: document.getElementById('file-input'),
  onImport: (xml) => importAndReport(xml, null),
})
setupFileDrop({ onFile: importFile })

document.getElementById('btn-save').addEventListener('click', async () => {
  const { xml } = await modeler.saveXML({ format: true })
  download(xml, baseName() + '.bpmn', 'application/xml')
})

// Menu Exporter : ouvert sous son bouton, refermé dès qu'un format est choisi.
const exportMenu = document.getElementById('export-menu')
exportMenu.addEventListener('beforetoggle', (e) => {
  if (e.newState !== 'open') return
  const r = document.getElementById('btn-export').getBoundingClientRect()
  exportMenu.style.left = r.left + 'px'
  exportMenu.style.top = (r.bottom + 4) + 'px'
})
exportMenu.addEventListener('click', (e) => {
  if (e.target.closest('button')) exportMenu.hidePopover()
})

setupXmlExport({
  openButton: document.getElementById('btn-xml'),
  getXml: async () => (await modeler.saveXML({ format: true })).xml,
  download: (xml) => download(xml, baseName() + '.xml', 'application/xml'),
})

document.getElementById('btn-svg').addEventListener('click', async () => {
  const { svg } = await modeler.saveSVG()
  download(svg, baseName() + '.svg', 'image/svg+xml')
})

document.getElementById('btn-png').addEventListener('click', async () => {
  const { svg } = await modeler.saveSVG()
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const scale = 2
    canvas.width = (img.naturalWidth || 800) * scale
    canvas.height = (img.naturalHeight || 600) * scale
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob(b => download(b, baseName() + '.png', 'image/png'), 'image/png')
  }
  img.onerror = () => {
    URL.revokeObjectURL(url)
    alert('Export PNG indisponible, utilise Export SVG.')
  }
  img.src = url
})

document.getElementById('btn-pdf').addEventListener('click', async (e) => {
  const button = e.currentTarget
  button.disabled = true
  try {
    download(await exportPdf(modeler), baseName() + '.pdf', 'application/pdf')
  } catch (err) {
    console.error('PDF export error:', err)
    alert('Export PDF impossible : ' + err.message)
  } finally {
    button.disabled = false
  }
})

document.getElementById('btn-layout').addEventListener('click', async () => {
  if (!confirm('Ranger le diagramme automatiquement ? Toutes les positions seront recalculées et l\'historique d\'annulation sera effacé.')) return
  try {
    await autoLayout(modeler)
    setStatus('Diagramme rangé')
  } catch (err) {
    console.error('Layout error:', err)
    alert('Mise en page impossible : ' + err.message)
  }
})

// Le bouton suit l'état réel de la simulation : on pilote le service de
// l'extension, et l'événement qu'elle émet met à jour le libellé, que la
// bascule vienne de ce bouton ou du contrôle intégré au canevas.
const simButton = document.getElementById('btn-simulation')
modeler.on('tokenSimulation.toggleMode', ({ active }) => {
  simButton.textContent = active ? 'Arrêter la simulation' : 'Simulation'
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
setupPanelToggle({
  button: document.getElementById('btn-properties'),
  panel: document.getElementById('properties-panel'),
  canvas: modeler.get('canvas'),
})
loadInitial()

// Chat intégré, en deux modes :
//   - en ligne (build « vite build --mode online ») : le chat tourne dans la page et
//     appelle le fournisseur réglé dans Options. Pas de pont MCP.
//   - serveur (développement, ou VITE_MCP_BRIDGE_URL définie au build) : pont vers le
//     serveur MCP (dossier mcp/), qui fait tourner le chat (route /chat).
if (import.meta.env.MODE === 'online') {
  Promise.all([import('./mcp-bridge.js'), import('./chat-panel.js')]).then(([{ createTools }, { createChatPanel }]) => {
    createChatPanel({ mode: 'online', tools: createTools(modeler) })
  })
} else {
  const mcpBridgeUrl = import.meta.env.VITE_MCP_BRIDGE_URL || (import.meta.env.DEV ? 'ws://127.0.0.1:3333/bridge' : '')
  if (mcpBridgeUrl) {
    Promise.all([import('./mcp-bridge.js'), import('./chat-panel.js')]).then(([{ connectMcpBridge }, { createChatPanel }]) => {
      const bridge = connectMcpBridge(modeler, mcpBridgeUrl)
      // Le chat intégré passe par le même serveur, route /chat.
      const chatUrl = mcpBridgeUrl.replace(/^ws/, 'http').replace(/\/bridge$/, '/chat')
      createChatPanel({ mode: 'server', chatUrl, bridge })
    })
  }
}
