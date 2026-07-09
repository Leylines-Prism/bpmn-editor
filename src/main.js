import BpmnModeler from 'bpmn-js/lib/Modeler'
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel'
import minimapModule from 'diagram-js-minimap'
import TokenSimulationModule from 'bpmn-js-token-simulation'

import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import '@bpmn-io/properties-panel/assets/properties-panel.css'
import 'diagram-js-minimap/assets/diagram-js-minimap.css'
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css'

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
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    minimapModule,
    TokenSimulationModule,
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

// ── Export PNG : embarque les fonts BPMN en base64 dans le SVG ────────────
async function fetchFontAsBase64(url) {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

document.getElementById('btn-png').addEventListener('click', async () => {
  try {
    const { svg } = await modeler.saveSVG()

    // Récupérer la font BPMN woff2 et l'embarquer en base64
    const fontUrl = new URL(
      '/node_modules/bpmn-js/dist/assets/bpmn-font/font/bpmn.woff2',
      window.location.origin
    ).href

    let fontFaceStyle = ''
    try {
      // Cherche la font dans les stylesheets déjà chargées
      const fontB64 = await fetchFontAsBase64(
        '/assets/bpmn-' + Array.from(document.styleSheets)
          .flatMap(s => { try { return Array.from(s.cssRules) } catch { return [] } })
          .find(r => r.cssText && r.cssText.includes('bpmn.woff2'))
          ?.cssText?.match(/url\("([^"]+\.woff2)"\)/)?.[1]?.split('/').pop() || ''
      )
      fontFaceStyle = `@font-face { font-family: 'bpmn'; src: url('data:font/woff2;base64,${fontB64}') format('woff2'); }`
    } catch {
      // Fallback : récupérer toutes les règles CSS sans les fonts
    }

    // Injecter styles + font dans le SVG
    const allStyles = Array.from(document.styleSheets)
      .flatMap(sheet => {
        try { return Array.from(sheet.cssRules).map(r => r.cssText) }
        catch { return [] }
      })
      .filter(rule => !rule.includes('url(')) // exclure les @font-face avec URL externes
      .join('\n')

    const svgWithStyles = svg.replace(
      /(<svg[^>]*>)/,
      `$1<defs><style>${fontFaceStyle}\n${allStyles}</style></defs>`
    )

    // Parser pour récupérer les dimensions
    const parser = new DOMParser()
    const svgDoc = parser.parseFromString(svgWithStyles, 'image/svg+xml')
    const svgEl = svgDoc.querySelector('svg')
    const vb = svgEl.getAttribute('viewBox')?.split(' ').map(Number)
    const w = vb ? vb[2] : (parseFloat(svgEl.getAttribute('width')) || 800)
    const h = vb ? vb[3] : (parseFloat(svgEl.getAttribute('height')) || 600)

    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const blob = new Blob([svgWithStyles], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
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
      alert('Export PNG échoué — utilise Export SVG à la place.')
    }
    img.src = url
  } catch (e) {
    console.error('Export PNG:', e)
    alert('Export PNG échoué — utilise Export SVG à la place.')
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
