// Déclencheurs admis par la norme BPMN 2.0 pour chaque sorte d'événement
// (tableaux des événements de début, intermédiaires, de bordure et de fin, BPMN 2.0.2 § 10.5).
// Une seule source pour la règle bpmnlint de l'éditeur (lint-config.js) et pour les outils
// de l'IA (mcp-bridge.js), qui refusent une combinaison interdite avant qu'elle n'entre au diagramme.
//
// eventTriggerProblem(event) prend l'objet métier (bpmn-moddle) et renvoie un message
// fixe en anglais, traduit par l'interface (i18n/fr.js), ou null. Un événement à plusieurs
// définitions (Multiple) est laissé à la règle single-event-definition.

const ALL_THROWN = ['None', 'Message', 'Escalation', 'Link', 'Signal', 'Compensate']

const is = (el, type) => !!el?.$instanceOf?.(type)

// « bpmn:TimerEventDefinition » → « Timer », sans définition → « None ».
function triggerOf(event) {
  const defs = event.eventDefinitions || []
  if (defs.length > 1) return null
  if (!defs.length) return 'None'
  return defs[0].$type.replace(/^bpmn:/, '').replace(/EventDefinition$/, '')
}

const inTransaction = (el) => {
  for (let p = el.$parent; p; p = p.$parent) {
    if (is(p, 'bpmn:Transaction')) return true
    if (is(p, 'bpmn:Process')) return false
  }
  return false
}

export const EVENT_TRIGGER_MESSAGES = {
  start: 'Trigger not allowed on a process start event',
  eventSubStart: 'Trigger not allowed on an event sub-process start event',
  nonInterrupting: 'This trigger cannot be non-interrupting',
  catch: 'Trigger not allowed on an intermediate catch event',
  throw: 'Trigger not allowed on an intermediate throw event',
  boundaryNone: 'Boundary event is missing a trigger',
  boundary: 'Trigger not allowed on a boundary event',
  end: 'Trigger not allowed on an end event',
  cancel: 'Cancel event only belongs to a transaction',
}
const M = EVENT_TRIGGER_MESSAGES

export function eventTriggerProblem(event) {
  if (!is(event, 'bpmn:Event')) return null
  const trigger = triggerOf(event)
  if (!trigger) return null
  const allow = (list, message) => (list.includes(trigger) ? null : message)

  if (is(event, 'bpmn:StartEvent')) {
    const parent = event.$parent
    if (is(parent, 'bpmn:SubProcess') && parent.triggeredByEvent) {
      // Un début vierge est déjà signalé par event-sub-process-typed-start-event.
      if (trigger === 'None') return null
      if (event.isInterrupting === false) return allow(['Message', 'Timer', 'Conditional', 'Signal', 'Escalation'], M.nonInterrupting)
      return allow(['Message', 'Timer', 'Conditional', 'Signal', 'Error', 'Escalation', 'Compensate'], M.eventSubStart)
    }
    // Sous-processus ordinaire : sub-process-blank-start-event s'en charge.
    if (is(parent, 'bpmn:SubProcess')) return null
    return allow(['None', 'Message', 'Timer', 'Conditional', 'Signal'], M.start)
  }
  if (is(event, 'bpmn:BoundaryEvent')) {
    if (trigger === 'None') return M.boundaryNone
    if (trigger === 'Cancel' && !is(event.attachedToRef, 'bpmn:Transaction')) return M.cancel
    if (event.cancelActivity === false) return allow(['Message', 'Timer', 'Conditional', 'Signal', 'Escalation'], M.nonInterrupting)
    return allow(['Message', 'Timer', 'Conditional', 'Signal', 'Error', 'Escalation', 'Compensate', 'Cancel'], M.boundary)
  }
  if (is(event, 'bpmn:IntermediateCatchEvent')) return allow(['Message', 'Timer', 'Conditional', 'Link', 'Signal'], M.catch)
  if (is(event, 'bpmn:IntermediateThrowEvent')) return allow(ALL_THROWN, M.throw)
  if (is(event, 'bpmn:EndEvent')) {
    if (trigger === 'Cancel' && !inTransaction(event)) return M.cancel
    return allow(['None', 'Message', 'Signal', 'Error', 'Escalation', 'Compensate', 'Cancel', 'Terminate'], M.end)
  }
  return null
}

// Règle bpmnlint « bpmnpilot/event-triggers » (même forme que les règles de bpmnlint).
export function eventTriggersRule() {
  return {
    check(node, reporter) {
      const message = eventTriggerProblem(node)
      if (message) reporter.report(node.id, message, ['eventDefinitions'])
    },
  }
}
