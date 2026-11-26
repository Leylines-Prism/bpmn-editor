// Groupe « Simulation » du panneau de propriétés : probabilité (en %) d'un flux qui sort
// d'une passerelle exclusive, inclusive, complexe ou basée sur les événements. Elle sert
// à « Lancer N jetons » de la carte de chaleur.
//
// La valeur est enregistrée dans le .bpmn sous l'attribut bpmnpilot:probability
// (src/bpmn-pilot-moddle.json), que les autres outils BPMN ignorent. Chaque saisie
// passe par modeling.updateModdleProperties : Ctrl+Z l'annule.

import { NumberFieldEntry, isNumberFieldEntryEdited } from '@bpmn-io/properties-panel'
import { useService } from 'bpmn-js-properties-panel'
import { getBusinessObject } from 'bpmn-js/lib/util/ModelUtil'
import { T, num } from './i18n/lang.js'
import { probabilityOf } from './simulation-stats.js'

const LOW_PRIORITY = 400
const BRANCHING = ['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway', 'bpmn:ComplexGateway', 'bpmn:EventBasedGateway']

export function isBranchFlow(element) {
  if (element?.type !== 'bpmn:SequenceFlow') return false
  const source = element.source
  return !!source && BRANCHING.includes(source.type) && (source.outgoing || []).length > 1
}

function ProbabilityEntry(props) {
  const { element, id } = props
  const modeling = useService('modeling')
  const debounce = useService('debounceInput')
  const bo = getBusinessObject(element)
  const siblings = (element.source.outgoing || []).map(getBusinessObject)
  const set = siblings.map(probabilityOf).filter((p) => p !== null)
  const total = set.reduce((a, b) => a + b, 0)
  const missing = siblings.length - set.length
  let description = T(`Branches of this gateway: ${num(total)} % set`, `Branches de cette passerelle : ${num(total)} % saisis`)
  if (missing) description += T(`, ${missing} left to share the rest`, `, ${missing} se partagent le reste`)
  else if (Math.round(total) !== 100) description += T(' (values are scaled to 100 %)', ' (les valeurs sont ramenées à 100 %)')

  return NumberFieldEntry({
    element,
    id,
    label: T('Probability (%)', 'Probabilité (%)'),
    description,
    min: 0,
    max: 100,
    step: 1,
    debounce,
    getValue: () => probabilityOf(bo) ?? undefined,
    setValue: (value) => {
      const n = Number(value)
      modeling.updateModdleProperties(element, bo, {
        'bpmnpilot:probability': value === undefined || value === '' || !Number.isFinite(n) ? undefined : Math.max(0, Math.min(100, n)),
      })
    },
  })
}

function ProbabilityPropertiesProvider(propertiesPanel) {
  propertiesPanel.registerProvider(LOW_PRIORITY, this)
}
ProbabilityPropertiesProvider.$inject = ['propertiesPanel']

ProbabilityPropertiesProvider.prototype.getGroups = function (element) {
  return (groups) => {
    if (!isBranchFlow(element)) return groups
    groups.push({
      id: 'bpmn-pilot-simulation',
      label: 'Simulation',
      entries: [{ id: 'bpmn-pilot-probability', component: ProbabilityEntry, isEdited: isNumberFieldEntryEdited }],
    })
    return groups
  }
}

export const ProbabilityPanelModule = {
  __init__: ['probabilityPropertiesProvider'],
  probabilityPropertiesProvider: ['type', ProbabilityPropertiesProvider],
}
