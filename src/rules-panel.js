// Deux champs du panneau de propriétés, pour tous (pas seulement en mode Expert) :
//
// - « Assigné à », sur les activités : la personne ou le rôle précis qui réalise
//   l'activité, en plus du couloir. Attribut bpmnpilot:assignee, repris par le rapport,
//   les fiches de procédure, le tableau d'import et l'export pour Camunda.
// - « Condition », sur les flux qui sortent d'une passerelle exclusive ou inclusive :
//   la règle en clair (« Avance < 3000 »), rangée dans bpmn:conditionExpression, l'élément
//   standard que les autres outils lisent. Tant que le flux n'a pas de libellé (ou que son
//   libellé reprend l'ancienne condition), le libellé suit la condition, pour la voir sur
//   le diagramme. Le flux par défaut n'a pas de condition.
//
// Chaque saisie passe par modeling : Ctrl+Z l'annule.

import { TextFieldEntry, isTextFieldEntryEdited } from '@bpmn-io/properties-panel'
import { useService } from 'bpmn-js-properties-panel'
import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'

const LOW_PRIORITY = 450
const CONDITIONAL_SOURCES = ['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway']

export function isConditionalFlow(element) {
  if (element?.type !== 'bpmn:SequenceFlow') return false
  const source = element.source
  if (!source || !CONDITIONAL_SOURCES.includes(source.type) || (source.outgoing || []).length < 2) return false
  return getBusinessObject(source).default !== getBusinessObject(element)
}

const isAssignable = (element) => is(element, 'bpmn:Activity') && !is(element, 'bpmn:SubProcess') && element.type !== 'label'

function AssigneeEntry(props) {
  const { element, id } = props
  const modeling = useService('modeling')
  const debounce = useService('debounceInput')
  const bo = getBusinessObject(element)
  return TextFieldEntry({
    element,
    id,
    label: T('Assigned to', 'Assigné à'),
    description: T('Person or precise role who performs it, in addition to the lane.', 'Personne ou rôle précis qui la réalise, en plus du couloir.'),
    debounce,
    getValue: () => bo.get('bpmnpilot:assignee') || '',
    setValue: (value) => modeling.updateModdleProperties(element, bo, { 'bpmnpilot:assignee': (value || '').trim() || undefined }),
  })
}

function ConditionEntry(props) {
  const { element, id } = props
  const modeling = useService('modeling')
  const bpmnFactory = useService('bpmnFactory')
  const debounce = useService('debounceInput')
  const bo = getBusinessObject(element)
  return TextFieldEntry({
    element,
    id,
    label: T('Condition', 'Condition'),
    description: T('Rule in plain words, e.g. Advance < 3000. Shown on the flow while it has no other label.',
      'Règle en clair, par exemple Avance < 3000. Affichée sur le flux tant qu\'il n\'a pas d\'autre libellé.'),
    debounce,
    getValue: () => bo.conditionExpression?.body || '',
    setValue: (value) => {
      const text = (value || '').trim()
      const previous = (bo.conditionExpression?.body || '').trim()
      const name = (bo.name || '').trim()
      const props = {
        conditionExpression: text ? bpmnFactory.create('bpmn:FormalExpression', { body: text }) : undefined,
      }
      if (!name || name === previous) props.name = text || undefined
      modeling.updateProperties(element, props)
    },
  })
}

function RulesPropertiesProvider(propertiesPanel) {
  propertiesPanel.registerProvider(LOW_PRIORITY, this)
}
RulesPropertiesProvider.$inject = ['propertiesPanel']

RulesPropertiesProvider.prototype.getGroups = function (element) {
  return (groups) => {
    const general = groups.find((g) => g.id === 'general')
    const add = (entry) => {
      if (general) general.entries.push(entry)
      else groups.unshift({ id: 'general', label: T('General', 'Général'), entries: [entry] })
    }
    if (isAssignable(element)) add({ id: 'bpmn-pilot-assignee', component: AssigneeEntry, isEdited: isTextFieldEntryEdited })
    if (isConditionalFlow(element)) add({ id: 'bpmn-pilot-condition', component: ConditionEntry, isEdited: isTextFieldEntryEdited })
    return groups
  }
}

export const RulesPanelModule = {
  __init__: ['rulesPropertiesProvider'],
  rulesPropertiesProvider: ['type', RulesPropertiesProvider],
}
