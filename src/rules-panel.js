// Champs du panneau de propriétés, pour tous (pas seulement en mode Expert) :
//
// - « Assigné à », sur les activités : la personne ou le rôle précis qui réalise
//   l'activité, en plus du couloir. Attribut bpmnpilot:assignee, repris par le rapport,
//   les fiches de procédure, le tableau d'import et l'export pour Camunda.
// - « Systèmes utilisés » (bpmnpilot:systems) et le groupe « Responsabilités (RACI) » :
//   Valide (A), Consultés (C), Informés (I), qui donnent la matrice RACI du rapport.
// - « Condition », sur les flux qui sortent d'une passerelle exclusive ou inclusive :
//   la règle en clair (« Avance < 3000 »), rangée dans bpmn:conditionExpression, l'élément
//   standard que les autres outils lisent. Tant que le flux n'a pas de libellé (ou que son
//   libellé reprend l'ancienne condition), le libellé suit la condition, pour la voir sur
//   le diagramme. Le flux par défaut n'a pas de condition.
//
// Chaque saisie passe par modeling : Ctrl+Z l'annule.

import { TextFieldEntry, SelectEntry, isTextFieldEntryEdited, isSelectEntryEdited } from '@bpmn-io/properties-panel'
import { useService } from 'bpmn-js-properties-panel'
import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'
import { isExpert } from './expert-mode.js'

const LOW_PRIORITY = 450
const CONDITIONAL_SOURCES = ['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway']

export function isConditionalFlow(element) {
  if (element?.type !== 'bpmn:SequenceFlow') return false
  const source = element.source
  if (!source || !CONDITIONAL_SOURCES.includes(source.type) || (source.outgoing || []).length < 2) return false
  return getBusinessObject(source).default !== getBusinessObject(element)
}

const isAssignable = (element) => is(element, 'bpmn:Activity') && !is(element, 'bpmn:SubProcess') && element.type !== 'label'

// Champ texte rangé dans un attribut bpmnpilot: de l'activité.
function attrEntry(attr, label, description) {
  return function AttrEntry(props) {
    const { element, id } = props
    const modeling = useService('modeling')
    const debounce = useService('debounceInput')
    const bo = getBusinessObject(element)
    return TextFieldEntry({
      element,
      id,
      label: label(),
      description: description(),
      debounce,
      getValue: () => bo.get(`bpmnpilot:${attr}`) || '',
      setValue: (value) => modeling.updateModdleProperties(element, bo, { [`bpmnpilot:${attr}`]: (value || '').trim() || undefined }),
    })
  }
}

const AssigneeEntry = attrEntry('assignee', () => T('Assigned to', 'Assigné à'),
  () => T('Person or precise role who performs it (R), in addition to the lane.', 'Personne ou rôle précis qui la réalise (R), en plus du couloir.'))
const SystemsEntry = attrEntry('systems', () => T('Systems used', 'Systèmes utilisés'),
  () => T('Applications or tools, comma-separated: ERP, email, business tool…', 'Applications ou outils, séparés par des virgules : ERP, messagerie, outil métier…'))
const AccountableEntry = attrEntry('accountable', () => T('Accountable (A)', 'Valide (A)'),
  () => T('Who answers for the result.', 'Qui répond du résultat.'))
const ConsultedEntry = attrEntry('consulted', () => T('Consulted (C)', 'Consultés (C)'),
  () => T('Roles asked for their opinion, comma-separated.', 'Rôles dont on demande l\'avis, séparés par des virgules.'))
const InformedEntry = attrEntry('informed', () => T('Informed (I)', 'Informés (I)'),
  () => T('Roles told of the result, comma-separated.', 'Rôles tenus au courant, séparés par des virgules.'))

// Potentiel d'IA (mode Expert) : noté par le Co-pilote ou à la main, repris par le rapport.
function AiPotentialEntry(props) {
  const { element, id } = props
  const modeling = useService('modeling')
  const bo = getBusinessObject(element)
  return SelectEntry({
    element,
    id,
    label: T('AI potential', 'Potentiel d\'IA'),
    getValue: () => bo.get('bpmnpilot:aiPotential') || '',
    setValue: (value) => modeling.updateModdleProperties(element, bo, { 'bpmnpilot:aiPotential': value || undefined }),
    getOptions: () => [
      { value: '', label: T('Not rated', 'Non noté') },
      { value: 'automate', label: T('Automatable (AI agent, human review)', 'Automatisable (agent IA, revue humaine)') },
      { value: 'assist', label: T('AI-assisted', 'Assistée par IA') },
      { value: 'human', label: T('Human', 'Humaine') },
    ],
  })
}
const AiReasonEntry = attrEntry('aiPotentialReason', () => T('Why, and safeguard', 'Raison et garde-fou'),
  () => T('Proposed by the AI co-pilot (Expert menu) or written by hand.', 'Proposé par le Co-pilote IA (menu Expert) ou écrit à la main.'))

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
    if (isAssignable(element)) {
      add({ id: 'bpmn-pilot-assignee', component: AssigneeEntry, isEdited: isTextFieldEntryEdited })
      add({ id: 'bpmn-pilot-systems', component: SystemsEntry, isEdited: isTextFieldEntryEdited })
      groups.push({
        id: 'bpmn-pilot-raci',
        label: T('Responsibilities (RACI)', 'Responsabilités (RACI)'),
        entries: [
          { id: 'bpmn-pilot-accountable', component: AccountableEntry, isEdited: isTextFieldEntryEdited },
          { id: 'bpmn-pilot-consulted', component: ConsultedEntry, isEdited: isTextFieldEntryEdited },
          { id: 'bpmn-pilot-informed', component: InformedEntry, isEdited: isTextFieldEntryEdited },
        ],
      })
      if (isExpert()) {
        groups.push({
          id: 'bpmn-pilot-ai-adoption',
          label: T('AI adoption', 'Adoption de l\'IA'),
          entries: [
            { id: 'bpmn-pilot-ai-potential', component: AiPotentialEntry, isEdited: isSelectEntryEdited },
            { id: 'bpmn-pilot-ai-reason', component: AiReasonEntry, isEdited: isTextFieldEntryEdited },
          ],
        })
      }
    }
    if (isConditionalFlow(element)) add({ id: 'bpmn-pilot-condition', component: ConditionEntry, isEdited: isTextFieldEntryEdited })
    return groups
  }
}

export const RulesPanelModule = {
  __init__: ['rulesPropertiesProvider'],
  rulesPropertiesProvider: ['type', RulesPropertiesProvider],
}
