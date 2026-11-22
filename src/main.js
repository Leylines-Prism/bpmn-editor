import BpmnModeler from 'bpmn-js/lib/Modeler'
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel'
import minimapModule from 'diagram-js-minimap'
import TokenSimulationModule from 'bpmn-js-token-simulation'
import { CreateAppendAnythingModule } from 'bpmn-js-create-append-anything'
import BpmnColorPickerModule from 'bpmn-js-color-picker'
import NativeCopyPasteModule from 'bpmn-js-native-copy-paste'
import LintModule from 'bpmn-js-bpmnlint'
import GridModule from 'diagram-js-grid'
import { layoutProcess } from 'bpmn-auto-layout'
import lintConfig from './packed-lint-config.js'
import TranslateModule from './i18n/translate.js'

import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import '@bpmn-io/properties-panel/assets/properties-panel.css'
import 'diagram-js-minimap/assets/diagram-js-minimap.css'
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css'
import 'bpmn-js-color-picker/colors/color-picker.css'
import 'bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css'

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
    TranslateModule,
  ],
})

async function loadInitial() {
  const saved = localStorage.getItem(LS_KEY)
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
  document.getElementById('autosave-status').textContent = 'Auto-save: ' + msg
}

modeler.on('commandStack.changed', () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      const { xml } = await modeler.saveXML({ format: true })
      localStorage.setItem(LS_KEY, xml)
      setStatus(new Date().toLocaleTimeString())
    } catch (e) { setStatus('erreur') }
  }, 1000)
})

document.getElementById('btn-new').addEventListener('click', async () => {
  if (!confirm('Créer un nouveau diagramme ? Le diagramme actuel sera perdu si non sauvegardé.')) return
  localStorage.removeItem(LS_KEY)
  await modeler.importXML(EMPTY_DIAGRAM)
  modeler.get('canvas').zoom('fit-viewport')
  setStatus('Nouveau')
})

document.getElementById('btn-open').addEventListener('click', () => {
  document.getElementById('file-input').click()
})

document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  if (!file) return
  const xml = await file.text()
  try {
    await modeler.importXML(xml)
    modeler.get('canvas').zoom('fit-viewport')
    setStatus('Fichier ouvert')
  } catch (err) {
    alert('Fichier BPMN invalide : ' + err.message)
  }
  e.target.value = ''
})

document.getElementById('btn-save').addEventListener('click', async () => {
  const { xml } = await modeler.saveXML({ format: true })
  download(xml, 'diagramme.bpmn', 'application/xml')
})

document.getElementById('btn-svg').addEventListener('click', async () => {
  const { svg } = await modeler.saveSVG()
  download(svg, 'diagramme.svg', 'image/svg+xml')
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
    canvas.toBlob(b => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = 'diagramme.png'
      a.click()
    }, 'image/png')
  }
  img.onerror = () => {
    URL.revokeObjectURL(url)
    alert('Export PNG indisponible, utilise Export SVG.')
  }
  img.src = url
})

// bpmn-auto-layout se repère avec les listes incoming/outgoing des éléments,
// or un fichier BPMN valide venu d'un autre outil peut ne pas les contenir.
// On les complète à partir des flux de séquence avant de ranger.
function ensureFlowRefs() {
  modeler.get('elementRegistry').forEach((el) => {
    const bo = el.businessObject
    if (!bo || bo.$type !== 'bpmn:SequenceFlow') return
    const { sourceRef, targetRef } = bo
    if (sourceRef && !(sourceRef.get('outgoing') || []).includes(bo)) sourceRef.get('outgoing').push(bo)
    if (targetRef && !(targetRef.get('incoming') || []).includes(bo)) targetRef.get('incoming').push(bo)
  })
}

document.getElementById('btn-layout').addEventListener('click', async () => {
  if (!confirm('Ranger le diagramme automatiquement ? Toutes les positions seront recalculées et l\'historique d\'annulation sera effacé.')) return
  try {
    ensureFlowRefs()
    const { xml } = await modeler.saveXML({ format: true })
    const laid = await layoutProcess(xml)
    await modeler.importXML(laid)
    modeler.get('canvas').zoom('fit-viewport')
    setStatus('Diagramme rangé')
  } catch (err) {
    console.error('Layout error:', err)
    alert('Mise en page impossible : ' + err.message)
  }
})

let simActive = false
document.getElementById('btn-simulation').addEventListener('click', () => {
  const btn = document.getElementById('btn-simulation')
  simActive = !simActive
  if (simActive) {
    btn.textContent = '⏹ Arrêter Simulation'
    btn.classList.add('active')
  } else {
    btn.textContent = '▶ Simulation'
    btn.classList.remove('active')
  }
  try {
    modeler.get('eventBus').fire('tokenSimulation.toggleMode')
  } catch(e) { console.warn('Simulation toggle:', e) }
})

function download(content, filename, type) {
  const a = document.createElement('a')
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  a.href = content instanceof Blob ? URL.createObjectURL(content) : URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

loadInitial()

// Pont vers le serveur MCP (dossier mcp/) : actif en développement, ou quand
// VITE_MCP_BRIDGE_URL est définie au moment du build.
const mcpBridgeUrl = import.meta.env.VITE_MCP_BRIDGE_URL || (import.meta.env.DEV ? 'ws://127.0.0.1:3333/bridge' : '')
if (mcpBridgeUrl) {
  import('./mcp-bridge.js').then(({ connectMcpBridge }) => connectMcpBridge(modeler, mcpBridgeUrl))
}
