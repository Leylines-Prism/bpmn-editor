// Mise en page automatique du diagramme ouvert, partagée par le bouton
// « Ranger » et l'outil MCP auto_layout.

import { layoutProcess } from 'bpmn-auto-layout'
import { fitView } from './fit-view.js'

// bpmn-auto-layout se repère avec les listes incoming/outgoing des éléments,
// or un fichier BPMN valide venu d'un autre outil peut ne pas les contenir.
// On les complète à partir des flux de séquence avant de ranger.
function ensureFlowRefs(modeler) {
  modeler.get('elementRegistry').forEach((el) => {
    const bo = el.businessObject
    if (!bo || bo.$type !== 'bpmn:SequenceFlow') return
    const { sourceRef, targetRef } = bo
    if (sourceRef && !(sourceRef.get('outgoing') || []).includes(bo)) sourceRef.get('outgoing').push(bo)
    if (targetRef && !(targetRef.get('incoming') || []).includes(bo)) targetRef.get('incoming').push(bo)
  })
}

// Recalcule toutes les positions puis recharge le diagramme. Le rechargement
// vide l'historique d'annulation. En cas d'échec, le diagramme reste inchangé.
export async function autoLayout(modeler) {
  ensureFlowRefs(modeler)
  const { xml } = await modeler.saveXML({ format: true })
  const laid = await layoutProcess(xml)
  await modeler.importXML(laid)
  fitView(modeler.get('canvas'))
}
