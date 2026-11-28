// Groupe « Simulation » du panneau de propriétés : objectif chiffré d'un événement de fin
// ou d'une activité (src/goals.js). Visible en mode Expert, comme les probabilités.
// Chaque saisie passe par modeling.updateModdleProperties : Ctrl+Z l'annule.

import { NumberFieldEntry, SelectEntry, isNumberFieldEntryEdited } from '@bpmn-io/properties-panel'
import { useService } from 'bpmn-js-properties-panel'
import { getBusinessObject } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'
import { goalOf, isGoalHolder } from './goals.js'

const LOW_PRIORITY = 390
const isA = (bo, type) => !!bo?.$instanceOf?.(type)

function ShareEntry({ element, id }) {
  const modeling = useService('modeling')
  const debounce = useService('debounceInput')
  const bo = getBusinessObject(element)
  const end = isA(bo, 'bpmn:EndEvent')
  return NumberFieldEntry({
    element,
    id,
    label: end ? T('Goal: share of instances (%)', 'Objectif : part des instances (%)') : T('Goal: passes per 100 instances', 'Objectif : passages pour 100 instances'),
    description: end
      ? T('Share of instances that should end here. The process report compares it with "Run N tokens".',
        'Part des instances qui devraient finir ici. Le rapport de processus la compare à « Lancer N jetons ».')
      : T('Each rework counts as one more pass. The process report compares it with "Run N tokens".',
        'Chaque reprise compte un passage de plus. Le rapport de processus le compare à « Lancer N jetons ».'),
    min: 0,
    max: end ? 100 : undefined,
    step: 1,
    debounce,
    getValue: () => goalOf(bo)?.share ?? undefined,
    setValue: (value) => {
      const n = Number(value)
      const clear = value === undefined || value === '' || !Number.isFinite(n)
      modeling.updateModdleProperties(element, bo, {
        'bpmnpilot:goalShare': clear ? undefined : Math.max(0, end ? Math.min(100, n) : n),
        'bpmnpilot:goalOp': clear ? undefined : goalOf(bo)?.op || (end ? 'min' : 'max'),
      })
    },
  })
}

function OpEntry({ element, id }) {
  const modeling = useService('modeling')
  const bo = getBusinessObject(element)
  return SelectEntry({
    element,
    id,
    label: T('Goal is', "L'objectif est"),
    getOptions: () => [
      { value: 'min', label: T('a minimum (at least)', 'un minimum (au moins)') },
      { value: 'max', label: T('a maximum (at most)', 'un maximum (au plus)') },
    ],
    getValue: () => goalOf(bo)?.op || 'min',
    setValue: (op) => modeling.updateModdleProperties(element, bo, { 'bpmnpilot:goalOp': op }),
  })
}

function GoalPropertiesProvider(propertiesPanel) {
  propertiesPanel.registerProvider(LOW_PRIORITY, this)
}
GoalPropertiesProvider.$inject = ['propertiesPanel']

GoalPropertiesProvider.prototype.getGroups = function (element) {
  return (groups) => {
    const bo = element && element.type !== 'label' ? getBusinessObject(element) : null
    if (!bo || !isGoalHolder(bo)) return groups
    const entries = [{ id: 'bpmn-pilot-goal-share', component: ShareEntry, isEdited: isNumberFieldEntryEdited }]
    if (goalOf(bo)) entries.push({ id: 'bpmn-pilot-goal-op', component: OpEntry })
    groups.push({ id: 'bpmn-pilot-simulation', label: T('Token simulation', 'Simulation de jetons'), entries })
    return groups
  }
}

export const GoalPanelModule = {
  __init__: ['goalPropertiesProvider'],
  goalPropertiesProvider: ['type', GoalPropertiesProvider],
}
