import BpmnModeler from 'bpmn-js/lib/Modeler'
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel'
import minimapModule from 'diagram-js-minimap'
import TokenSimulationModule from 'bpmn-js-token-simulation'

import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import '@bpmn-io/properties-panel/assets/properties-panel.css'
import 'diagram-js-minimap/assets/minimap.css'
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css'

// ── Diagramme minimal par défaut ──────────────────────────────────────────
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

// ── Init modeler ──────────────────────────────────────────────────────────
const modeler = new BpmnModeler({
  container: '#canvas',
  propertiesPanel: { parent: '#properties-panel' },
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    minimapModule,
    TokenSimulationModule,
  ],
})

// ── Charger diagramme (localStorage ou vierge) ────────────────────────────
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

// ── Auto-save ─────────────────────────────────────────────────────────────
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

// ── Bouton Nouveau ────────────────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', async () => {
  if (!confirm('Créer un nouveau diagramme ? Le diagramme actuel sera perdu si non sauvegardé.')) return
  localStorage.removeItem(LS_KEY)
  await modeler.importXML(EMPTY_DIAGRAM)
  modeler.get('canvas').zoom('fit-viewport')
  setStatus('Nouveau')
})

// ── Bouton Ouvrir ─────────────────────────────────────────────────────────
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

// ── Bouton Enregistrer .bpmn ──────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', async () => {
  const { xml } = await modeler.saveXML({ format: true })
  download(xml, 'diagramme.bpmn', 'application/xml')
})

// ── Export SVG ────────────────────────────────────────────────────────────
document.getElementById('btn-svg').addEventListener('click', async () => {
  const { svg } = await modeler.saveSVG()
  download(svg, 'diagramme.svg', 'image/svg+xml')
})

// ── Export PNG ────────────────────────────────────────────────────────────
document.getElementById('btn-png').addEventListener('click', async () => {
  const { svg } = await modeler.saveSVG()
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const scale = 2 // retina
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, img.width, img.height)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob(b => download(URL.createObjectURL(b), 'diagramme.png', 'image/png'))
  }
  img.src = url
})

// ── Bouton Simulation ─────────────────────────────────────────────────────
let simActive = false
document.getElementById('btn-simulation').addEventListener('click', () => {
  const btn = document.getElementById('btn-simulation')
  simActive = !simActive
  // token-simulation s'active via l'UI bpmn-js (bouton dans la palette)
  // ce bouton sert d'indicateur visuel + bascule le mode
  if (simActive) {
    btn.textContent = '⏹ Arrêter Simulation'
    btn.classList.add('active')
  } else {
    btn.textContent = '▶ Simulation'
    btn.classList.remove('active')
  }
  // Déclencher le toggle simulation via l'eventBus
  try {
    const toggleEvent = simActive ? 'tokenSimulation.toggleMode' : 'tokenSimulation.toggleMode'
    modeler.get('eventBus').fire('tokenSimulation.toggleMode')
  } catch(e) { console.warn('Simulation toggle:', e) }
})

// ── Utilitaire download ───────────────────────────────────────────────────
function download(content, filename, type) {
  const a = document.createElement('a')
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  a.href = content instanceof Blob ? URL.createObjectURL(content) : URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ── Lancement ─────────────────────────────────────────────────────────────
loadInitial()
