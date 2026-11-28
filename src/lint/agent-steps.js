// Étape d'agent IA : un sous-processus ad hoc marqué bpmnpilot:agent="true". L'agent choisit
// lui-même, à l'exécution, lesquelles de ses activités (ses outils) lancer et dans quel ordre :
// c'est le sens du sous-processus ad hoc dans BPMN 2.0 (§ 10.3.5). Le marquage ne sert qu'à
// l'éditeur ; un autre outil BPMN lit un sous-processus ad hoc ordinaire.
//
// Deux règles bpmnlint en découlent, en avertissement :
//   bpmnpilot/agent-review      le résultat de l'agent passe par une personne (tâche
//                               utilisateur ou manuelle) avant une fin, sur chaque chemin,
//                               ou une telle tâche figure dans l'étape elle-même ;
//   bpmnpilot/agent-escalation  l'étape a une sortie si l'agent échoue ou n'aboutit pas :
//                               un événement en bordure (minuterie, erreur, escalade…).
//
// Une seule source pour les règles, le panneau de propriétés et les outils de l'IA.
// Ce module ne dépend de rien : il tourne dans la page et dans les tests.

const is = (el, type) => !!el?.$instanceOf?.(type)

export const AGENT_MESSAGES = {
  review: 'AI agent step without human review: route its result to a user or manual task',
  escalation: 'AI agent step without an exit if the agent fails: add a timer, error or escalation boundary event',
}

const HUMAN = ['bpmn:UserTask', 'bpmn:ManualTask']
const isHuman = (el) => HUMAN.some((t) => is(el, t))

export function isAgentStep(bo) {
  if (!is(bo, 'bpmn:AdHocSubProcess')) return false
  const value = bo.get ? bo.get('bpmnpilot:agent') : bo.agent
  return value === true || value === 'true' || bo.$attrs?.['bpmnpilot:agent'] === 'true'
}

// Flux sortants lus sur les flux eux-mêmes : certains fichiers omettent <outgoing>.
function outgoingOf(node) {
  const flows = (node.$parent?.flowElements || []).filter((f) => is(f, 'bpmn:SequenceFlow') && f.sourceRef === node)
  return flows.length ? flows : node.outgoing || []
}

export function boundariesOf(node) {
  return (node.$parent?.flowElements || []).filter((e) => is(e, 'bpmn:BoundaryEvent') && e.attachedToRef === node)
}

// Vrai si une personne intervient dans l'étape ou sur chaque chemin qui en sort.
export function hasHumanReview(step) {
  if ((step.flowElements || []).some(isHuman)) return true
  const start = outgoingOf(step).map((f) => f.targetRef).filter(Boolean)
  if (!start.length) return false
  const seen = new Set()
  // Un chemin sans personne qui atteint une fin, ou une impasse, suffit à manquer la revue.
  const reviewed = (node) => {
    if (isHuman(node)) return true
    if (seen.has(node)) return true // boucle : jugée sur ses autres chemins
    seen.add(node)
    const next = outgoingOf(node).map((f) => f.targetRef).filter(Boolean)
    if (!next.length) return false
    return next.every(reviewed)
  }
  return start.every(reviewed)
}

export function hasEscalationExit(step) {
  return boundariesOf(step).some((b) => !(b.eventDefinitions || []).some((d) => is(d, 'bpmn:CompensateEventDefinition')))
}

// Règles bpmnlint (même forme que les règles de bpmnlint).
export function agentReviewRule() {
  return {
    check(node, reporter) {
      if (isAgentStep(node) && !hasHumanReview(node)) reporter.report(node.id, AGENT_MESSAGES.review)
    },
  }
}

export function agentEscalationRule() {
  return {
    check(node, reporter) {
      if (isAgentStep(node) && !hasEscalationExit(node)) reporter.report(node.id, AGENT_MESSAGES.escalation)
    },
  }
}
