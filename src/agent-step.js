// Étape d'agent IA dans l'éditeur (règles et définition : src/lint/agent-steps.js).
//
//   - groupe « Agent IA » du panneau de propriétés, sur une tâche, un sous-processus ou un
//     sous-processus ad hoc : la case « Étape d'agent IA » change l'élément en sous-processus
//     ad hoc (BPMN standard) marqué bpmnpilot:agent ; décochée, elle retire la marque et
//     laisse le sous-processus ad hoc ;
//   - bouton « Compléter le motif » : ajoute ce que les deux règles demandent et qui manque,
//     une tâche utilisateur de revue après l'étape, et une minuterie en bordure qui mène à un
//     traitement à la main ;
//   - pastille « Agent IA » sur chaque étape marquée.
// Chaque geste est une seule commande : Ctrl+Z l'annule en entier.

import htm from 'htm'
import { h } from '@bpmn-io/properties-panel/preact'
import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks'
import { CheckboxEntry } from '@bpmn-io/properties-panel'
import { useService } from 'bpmn-js-properties-panel'
import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'
import { isAgentStep, hasHumanReview, hasEscalationExit } from './lint/agent-steps.js'

const html = htm.bind(h)
const LOW_PRIORITY = 450
const OVERLAY = 'agent-step'
const SHIFT = 160

// Éléments qu'on peut faire devenir une étape d'agent IA.
export function canBeAgentStep(element) {
  const bo = element && getBusinessObject(element)
  if (!bo || element.type === 'label') return false
  if (is(bo, 'bpmn:AdHocSubProcess')) return true
  if (is(bo, 'bpmn:Transaction') || bo.triggeredByEvent) return false
  return is(bo, 'bpmn:SubProcess') || is(bo, 'bpmn:Task')
}

// ── Commandes ───────────────────────────────────────────────────────────────

function AgentStepCommands(commandStack, modeling, bpmnReplace, elementFactory, elementRegistry) {
  // Marque (ou démarque) une étape. context.element devient l'élément final.
  commandStack.registerHandler('agentStep.setAgent', function () {
    this.preExecute = (context) => {
      let { element } = context
      if (context.agent && !is(element, 'bpmn:AdHocSubProcess')) {
        const expanded = is(element, 'bpmn:SubProcess') && element.collapsed === false
        element = bpmnReplace.replaceElement(element, { type: 'bpmn:AdHocSubProcess', isExpanded: expanded })
      }
      modeling.updateProperties(element, { 'bpmnpilot:agent': context.agent ? true : undefined })
      context.element = element
    }
    this.execute = () => []
    this.revert = () => []
  })

  commandStack.registerHandler('agentStep.complete', function () {
    this.preExecute = (context) => {
      const step = context.element
      const bo = getBusinessObject(step)
      const midY = step.y + step.height / 2
      if (!hasHumanReview(bo)) {
        const previous = [...step.outgoing].filter((c) => is(c, 'bpmn:SequenceFlow'))
        // Place libre à droite : ce qui suit l'étape, dans le même conteneur, glisse d'un cran.
        const right = step.x + step.width
        const after = elementRegistry.filter((e) => e.parent === step.parent && !e.waypoints && e.type !== 'label'
          && e.host !== step && e.x >= right && !is(e, 'bpmn:Lane'))
        if (after.length) modeling.moveElements(after, { x: SHIFT, y: 0 })
        const review = modeling.appendShape(step, { type: 'bpmn:UserTask' }, { x: right + 90, y: midY }, step.parent)
        modeling.updateLabel(review, T("Review the agent's proposal", "Revoir la proposition de l'agent"))
        for (const connection of previous) {
          modeling.reconnectStart(connection, review, { x: review.x + review.width, y: review.y + review.height / 2 })
        }
      }
      if (!hasEscalationExit(bo)) {
        const shape = elementFactory.createShape({ type: 'bpmn:BoundaryEvent', eventDefinitionType: 'bpmn:TimerEventDefinition' })
        const x = step.x + Math.max(step.width - 30, step.width / 2)
        const boundary = modeling.createShape(shape, { x, y: step.y + step.height }, step, { attach: true })
        modeling.updateLabel(boundary, T('Time limit exceeded', 'Délai dépassé'))
        const below = step.y + step.height + 110
        const manual = modeling.appendShape(boundary, { type: 'bpmn:UserTask' }, { x: x + 100, y: below }, step.parent)
        modeling.updateLabel(manual, T('Handle it manually', 'Traiter à la main'))
        const end = modeling.appendShape(manual, { type: 'bpmn:EndEvent' }, { x: manual.x + manual.width + 80, y: below }, step.parent)
        modeling.updateLabel(end, T('Handled manually', 'Traitée à la main'))
      }
    }
    this.execute = () => []
    this.revert = () => []
  })
}
AgentStepCommands.$inject = ['commandStack', 'modeling', 'bpmnReplace', 'elementFactory', 'elementRegistry']

// ── Panneau de propriétés ───────────────────────────────────────────────────

function AgentEntry({ element, id }) {
  const commandStack = useService('commandStack')
  const selection = useService('selection')
  const bo = getBusinessObject(element)
  return CheckboxEntry({
    element,
    id,
    label: T('AI agent step', "Étape d'agent IA"),
    description: is(bo, 'bpmn:AdHocSubProcess')
      ? T('The agent picks which of the inner activities (its tools) to run, and in which order.',
        "L'agent choisit lui-même lesquelles des activités internes (ses outils) lancer, et dans quel ordre.")
      : T('Turns this element into an ad-hoc sub-process (standard BPMN): its inner activities are the agent\'s tools.',
        "Change cet élément en sous-processus ad hoc (BPMN standard) : ses activités internes sont les outils de l'agent."),
    getValue: () => isAgentStep(bo),
    setValue: (checked) => {
      const context = { element, agent: checked }
      commandStack.execute('agentStep.setAgent', context)
      if (context.element !== element) selection.select(context.element)
    },
  })
}

function PatternEntry({ element, id }) {
  const commandStack = useService('commandStack')
  const eventBus = useService('eventBus')
  // Le motif dépend des éléments voisins : le panneau ne se redessine pas pour eux seul.
  const [, setVersion] = useState(0)
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1)
    eventBus.on('elements.changed', refresh)
    return () => eventBus.off('elements.changed', refresh)
  }, [eventBus])
  const bo = getBusinessObject(element)
  const review = hasHumanReview(bo)
  const exit = hasEscalationExit(bo)
  const missing = [
    !review && T('a review by a person', 'une revue par une personne'),
    !exit && T('an exit if the agent fails', "une sortie si l'agent échoue"),
  ].filter(Boolean)
  return html`<div class="bio-properties-panel-entry agent-pattern" data-entry-id=${id}>
    <p class="agent-pattern-state">${missing.length
      ? T(`Missing: ${missing.join(' and ')}.`, `Il manque ${missing.join(' et ')}.`)
      : T('Review and exit are in place.', 'Revue et sortie en place.')}</p>
    ${missing.length ? html`<button type="button" class="appearance-button" id=${id + '-complete'}
      title=${T('Adds a user task after the step and a timer boundary event that leads to manual handling. Ctrl+Z undoes it.',
        "Ajoute une tâche utilisateur après l'étape et une minuterie en bordure qui mène à un traitement à la main. Ctrl+Z l'annule.")}
      onClick=${() => commandStack.execute('agentStep.complete', { element })}>${T('Complete the pattern', 'Compléter le motif')}</button>` : null}
  </div>`
}

function AgentPropertiesProvider(propertiesPanel) {
  propertiesPanel.registerProvider(LOW_PRIORITY, this)
}
AgentPropertiesProvider.$inject = ['propertiesPanel']

AgentPropertiesProvider.prototype.getGroups = function (element) {
  return (groups) => {
    if (!canBeAgentStep(element)) return groups
    const entries = [{ id: 'bpmn-pilot-agent-step', component: AgentEntry }]
    if (isAgentStep(getBusinessObject(element))) entries.push({ id: 'bpmn-pilot-agent-pattern', component: PatternEntry })
    groups.push({ id: 'bpmn-pilot-agent', label: T('AI agent', 'Agent IA'), entries })
    return groups
  }
}

// ── Pastille sur le canevas ─────────────────────────────────────────────────

function AgentBadges(eventBus, overlays, elementRegistry) {
  const badge = () => {
    const el = document.createElement('div')
    el.className = 'agent-step-badge'
    el.textContent = T('AI agent', 'Agent IA')
    return el
  }
  const refresh = (element) => {
    overlays.remove({ element, type: OVERLAY })
    if (!element || element.type === 'label' || element.waypoints || !elementRegistry.get(element.id)) return
    if (isAgentStep(getBusinessObject(element))) overlays.add(element, OVERLAY, { position: { top: -10, left: 8 }, html: badge() })
  }
  eventBus.on('import.done', () => {
    overlays.remove({ type: OVERLAY })
    elementRegistry.getAll().forEach(refresh)
  })
  eventBus.on('elements.changed', ({ elements }) => elements.forEach(refresh))
}
AgentBadges.$inject = ['eventBus', 'overlays', 'elementRegistry']

export const AgentStepModule = {
  __init__: ['agentStepCommands', 'agentPropertiesProvider', 'agentBadges'],
  agentStepCommands: ['type', AgentStepCommands],
  agentPropertiesProvider: ['type', AgentPropertiesProvider],
  agentBadges: ['type', AgentBadges],
}
