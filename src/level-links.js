// Liens entre niveaux de la carte (src/sub-levels.js), sans dépendance au canevas : ils
// tournent dans les tests.

import { T } from './i18n/lang.js'

export const linkOf = (bo) => ({ key: bo.get('bpmnpilot:linkedDiagram') || '', name: bo.get('bpmnpilot:linkedDiagramName') || '' })

// Diagramme enregistré qui correspond au lien : par sa clé, sinon par son nom (s'il est seul).
export function resolveLink(link, rows) {
  if (!link.key && !link.name) return null
  const byKey = rows.find((r) => r.key === link.key)
  if (byKey) return byKey
  const byName = rows.filter((r) => r.name === link.name)
  return byName.length === 1 ? byName[0] : null
}

// Identifiant du premier processus d'un fichier BPMN (pour calledElement).
export function firstProcessId(xml) {
  const m = /<(?:[\w-]+:)?process\b[^>]*\bid="([^"]+)"/.exec(xml || '')
  return m ? m[1] : ''
}

const xmlEscape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Diagramme de départ d'un sous-niveau : un début et une fin, reliés, au nom de l'activité.
export function subLevelXml(name, processId) {
  const start = xmlEscape(T('Start', 'Début'))
  const end = xmlEscape(T('End', 'Fin'))
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_${processId}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processId}" name="${xmlEscape(name)}" isExecutable="false">
    <bpmn:startEvent id="${processId}_start" name="${start}"><bpmn:outgoing>${processId}_flow</bpmn:outgoing></bpmn:startEvent>
    <bpmn:endEvent id="${processId}_end" name="${end}"><bpmn:incoming>${processId}_flow</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="${processId}_flow" sourceRef="${processId}_start" targetRef="${processId}_end" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_${processId}">
    <bpmndi:BPMNPlane id="BPMNPlane_${processId}" bpmnElement="${processId}">
      <bpmndi:BPMNShape id="${processId}_start_di" bpmnElement="${processId}_start"><dc:Bounds x="182" y="182" width="36" height="36" /><bpmndi:BPMNLabel><dc:Bounds x="180" y="225" width="40" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="${processId}_end_di" bpmnElement="${processId}_end"><dc:Bounds x="432" y="182" width="36" height="36" /><bpmndi:BPMNLabel><dc:Bounds x="430" y="225" width="40" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="${processId}_flow_di" bpmnElement="${processId}_flow"><di:waypoint x="218" y="200" /><di:waypoint x="432" y="200" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`
}
