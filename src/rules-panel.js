// Champs du panneau de propriétés, pour tous (pas seulement en mode Expert) :
//
// - « Assigné à », sur les activités : la personne ou le rôle précis qui réalise
//   l'activité, en plus du couloir. Attribut bpmnpilot:assignee, repris par le rapport,
//   les fiches de procédure, le tableau d'import et l'export pour Camunda.
// - « Systèmes utilisés » (bpmnpilot:systems) et le groupe « Responsabilités (RACI) » :
//   Approbateur (A), Consultés (C), Informés (I), qui donnent la matrice RACI du rapport.
// - « Condition », sur les flux qui sortent d'une passerelle exclusive ou inclusive :
//   la règle en clair (« Avance < 3000 »), rangée dans bpmn:conditionExpression, l'élément
//   standard que les autres outils lisent. Tant que le flux n'a pas de libellé (ou que son
//   libellé reprend l'ancienne condition), le libellé suit la condition, pour la voir sur
//   le diagramme. Le flux par défaut n'a pas de condition.
//
// En mode Expert seulement : le groupe « Adoption de l'IA » et le groupe « Risques et
// conformité » des activités, et la « Fiche d'identité du processus » sur la racine du
// diagramme (voir src/compliance.js).
//
// Chaque saisie passe par modeling : Ctrl+Z l'annule.

import { TextFieldEntry, TextAreaEntry, SelectEntry, isTextFieldEntryEdited, isTextAreaEntryEdited, isSelectEntryEdited } from '@bpmn-io/properties-panel'
import { useService } from 'bpmn-js-properties-panel'
import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'
import { isExpert, EXPERT_EVENT } from './expert-mode.js'
import { isModuleOn, MODULES_EVENT } from './expert-modules.js'
import { PROCESS_STATUS, identityHolder } from './compliance.js'

const LOW_PRIORITY = 450
const CONDITIONAL_SOURCES = ['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway']

export function isConditionalFlow(element) {
  if (element?.type !== 'bpmn:SequenceFlow') return false
  const source = element.source
  if (!source || !CONDITIONAL_SOURCES.includes(source.type) || (source.outgoing || []).length < 2) return false
  return getBusinessObject(source).default !== getBusinessObject(element)
}

const isAssignable = (element) => is(element, 'bpmn:Activity') && !is(element, 'bpmn:SubProcess') && element.type !== 'label'

// Champ texte rangé dans un attribut bpmnpilot: de l'élément. multiline : zone de texte,
// une valeur par ligne (les lignes vides sont retirées).
// holder : l'objet qui porte l'attribut, s'il n'est pas celui de l'élément.
function attrEntry(attr, label, description, { multiline = false, holder = getBusinessObject } = {}) {
  return function AttrEntry(props) {
    const { element, id } = props
    const modeling = useService('modeling')
    const debounce = useService('debounceInput')
    const bo = holder(element)
    const tidy = (value) => (multiline
      ? String(value || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n')
      : String(value || '').trim())
    return (multiline ? TextAreaEntry : TextFieldEntry)({
      element,
      id,
      label: label(),
      description: description(),
      debounce,
      ...(multiline ? { rows: 3, autoResize: true } : {}),
      getValue: () => bo.get(`bpmnpilot:${attr}`) || '',
      setValue: (value) => modeling.updateModdleProperties(element, bo, { [`bpmnpilot:${attr}`]: tidy(value) || undefined }),
    })
  }
}

const AssigneeEntry = attrEntry('assignee', () => T('Assigned to', 'Assigné à'),
  () => T('Person or precise role who performs it (R), in addition to the lane.', 'Personne ou rôle précis qui la réalise (R), en plus du couloir.'))
const SystemsEntry = attrEntry('systems', () => T('Systems used', 'Systèmes utilisés'),
  () => T('Applications or tools, comma-separated: ERP, email, business tool…', 'Applications ou outils, séparés par des virgules : ERP, messagerie, outil métier…'))
const AccountableEntry = attrEntry('accountable', () => T('Accountable (A)', 'Approbateur (A)'),
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

// Risques et conformité (mode Expert).
const RisksEntry = attrEntry('risks', () => T('Risks', 'Risques'),
  () => T('One per line: what can go wrong at this step (error, delay, fraud, personal data…).', 'Un par ligne : ce qui peut mal tourner à cette étape (erreur, retard, fraude, données personnelles…).'), { multiline: true })
const ControlsEntry = attrEntry('controls', () => T('Controls', 'Contrôles'),
  () => T('One per line: what prevents or detects these risks (review, double check, threshold, log…).', 'Un par ligne : ce qui prévient ou détecte ces risques (relecture, double contrôle, seuil, trace…).'), { multiline: true })
const RequirementsEntry = attrEntry('requirements', () => T('Requirements', 'Exigences'),
  () => T('References separated by semicolons: GDPR art. 30; ISO 9001 §8.5; AI Act art. 14.', 'Références séparées par des points-virgules : RGPD art. 30 ; ISO 9001 §8.5 ; AI Act art. 14.'))

// Fiche d'identité du processus (mode Expert), montrée sur la racine du diagramme et
// rangée sur le processus principal (voir src/compliance.js).
const identityBo = (element) => identityHolder(getBusinessObject(element))
const OwnerEntry = attrEntry('owner', () => T('Process owner', 'Propriétaire du processus'),
  () => T('Person or role who answers for the process and approves its changes.', 'Personne ou rôle qui répond du processus et valide ses changements.'), { holder: identityBo })
const VersionEntry = attrEntry('version', () => T('Version', 'Version'),
  () => T('Version of the process, e.g. 2.1.', 'Version du processus, par exemple 2.1.'), { holder: identityBo })
const ValidatedOnEntry = attrEntry('validatedOn', () => T('Approved on', 'Validé le'),
  () => T('Date of approval, e.g. 2026-11-27.', 'Date de validation, par exemple 27/11/2026.'), { holder: identityBo })
const ScopeEntry = attrEntry('scope', () => T('Scope', 'Périmètre'),
  () => T('Where the process applies, where it starts and ends, what it leaves out.', 'Où le processus s\'applique, où il commence et finit, ce qu\'il exclut.'), { multiline: true, holder: identityBo })
function StatusEntry(props) {
  const { element, id } = props
  const modeling = useService('modeling')
  const bo = identityBo(element)
  return SelectEntry({
    element,
    id,
    label: T('Status', 'Statut'),
    getValue: () => bo.get('bpmnpilot:status') || '',
    setValue: (value) => modeling.updateModdleProperties(element, bo, { 'bpmnpilot:status': value || undefined }),
    getOptions: () => [{ value: '', label: T('Not set', 'Non renseigné') },
      ...Object.entries(PROCESS_STATUS).map(([value, label]) => ({ value, label: label() }))],
  })
}

// La racine du diagramme : le processus, ou la collaboration quand il y a des pools.
const isDiagramRoot = (element) => !element.parent && ['bpmn:Process', 'bpmn:Collaboration'].includes(element.type)

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

function RulesPropertiesProvider(propertiesPanel, eventBus) {
  propertiesPanel.registerProvider(LOW_PRIORITY, this)
  // Les groupes du mode Expert apparaissent ou disparaissent dès qu'on change de mode ou de modules.
  const refresh = () => eventBus.fire('propertiesPanel.providersChanged')
  window.addEventListener(EXPERT_EVENT, refresh)
  window.addEventListener(MODULES_EVENT, refresh)
}
RulesPropertiesProvider.$inject = ['propertiesPanel', 'eventBus']

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
      if (isExpert() && isModuleOn('ai-potential')) {
        groups.push({
          id: 'bpmn-pilot-ai-adoption',
          label: T('AI adoption', 'Adoption de l\'IA'),
          entries: [
            { id: 'bpmn-pilot-ai-potential', component: AiPotentialEntry, isEdited: isSelectEntryEdited },
            { id: 'bpmn-pilot-ai-reason', component: AiReasonEntry, isEdited: isTextFieldEntryEdited },
          ],
        })
      }
      if (isExpert() && isModuleOn('compliance')) {
        groups.push({
          id: 'bpmn-pilot-compliance',
          label: T('Risks and compliance', 'Risques et conformité'),
          entries: [
            { id: 'bpmn-pilot-risks', component: RisksEntry, isEdited: isTextAreaEntryEdited },
            { id: 'bpmn-pilot-controls', component: ControlsEntry, isEdited: isTextAreaEntryEdited },
            { id: 'bpmn-pilot-requirements', component: RequirementsEntry, isEdited: isTextFieldEntryEdited },
          ],
        })
      }
    }
    if (isExpert() && isModuleOn('compliance') && isDiagramRoot(element)) {
      groups.splice(1, 0, {
        id: 'bpmn-pilot-identity',
        label: T('Process identity', 'Fiche d\'identité du processus'),
        entries: [
          { id: 'bpmn-pilot-owner', component: OwnerEntry, isEdited: isTextFieldEntryEdited },
          { id: 'bpmn-pilot-version', component: VersionEntry, isEdited: isTextFieldEntryEdited },
          { id: 'bpmn-pilot-status', component: StatusEntry, isEdited: isSelectEntryEdited },
          { id: 'bpmn-pilot-validated-on', component: ValidatedOnEntry, isEdited: isTextFieldEntryEdited },
          { id: 'bpmn-pilot-scope', component: ScopeEntry, isEdited: isTextAreaEntryEdited },
        ],
      })
    }
    if (isConditionalFlow(element)) add({ id: 'bpmn-pilot-condition', component: ConditionEntry, isEdited: isTextFieldEntryEdited })
    return groups
  }
}

export const RulesPanelModule = {
  __init__: ['rulesPropertiesProvider'],
  rulesPropertiesProvider: ['type', RulesPropertiesProvider],
}
