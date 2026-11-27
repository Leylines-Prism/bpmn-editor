// Objectifs chiffrés du processus, posés sur les éléments qu'ils mesurent :
//   - sur un événement de fin : la part des instances qui finissent là (« au moins 80 % des
//     demandes acceptées ») ;
//   - sur une activité : les passages pour 100 instances, une reprise comptant à chaque
//     passage (« au plus 15 retours en correction pour 100 demandes »).
// La cible vit dans le .bpmn (bpmnpilot:goalShare en %, bpmnpilot:goalOp « min » ou
// « max », src/bpmn-pilot-moddle.json), que les autres outils BPMN ignorent. « Lancer N
// jetons » de la carte de chaleur la mesure, et le rapport de processus la confronte au
// résultat. Les objectifs sont le choix de l'utilisateur : les outils de l'IA les lisent
// dans le rapport, sans les écrire.
//
// Ce module ne dépend de rien : il tourne dans la page et dans les tests. La saisie est dans
// src/goal-panel.js.

const isA = (bo, type) => !!bo?.$instanceOf?.(type)

export const isGoalHolder = (bo) => isA(bo, 'bpmn:EndEvent') || isA(bo, 'bpmn:Activity')

// { share, op } ou null. Lu aussi sans l'extension de l'éditeur ($attrs), pour les tests.
export function goalOf(bo) {
  if (!isGoalHolder(bo)) return null
  const get = (name) => (bo.get ? bo.get(`bpmnpilot:${name}`) : undefined) ?? bo.$attrs?.[`bpmnpilot:${name}`]
  const share = Number(get('goalShare'))
  if (get('goalShare') === undefined || get('goalShare') === '' || !Number.isFinite(share) || share < 0) return null
  return { share, op: get('goalOp') === 'max' ? 'max' : 'min' }
}

// Mesure d'une série de jetons : % des instances (fin) ou passages pour 100 instances (activité).
export function measureGoal(bo, simulation) {
  if (!simulation?.runs) return null
  return ((simulation.nodes[bo.id] || 0) / simulation.runs) * 100
}

export const goalMet = (goal, measured) => (goal.op === 'max' ? measured <= goal.share : measured >= goal.share)
