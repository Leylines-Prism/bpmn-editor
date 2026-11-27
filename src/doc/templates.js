// Modèles de documentation par sorte d'élément : de simples titres Markdown, donc rien de
// propre à BPMN Pilot dans le fichier. Le modèle d'une passerelle reprend le nom de
// chacune de ses branches.

import { T } from '../i18n/lang.js'

const is = (bo, type) => !!bo?.$instanceOf?.(type)

export const TEMPLATES = [
  {
    id: 'activity',
    label: () => T('Activity', 'Activité'),
    hint: () => T('Purpose, actors, inputs, outputs, rules, references', 'Objectif, acteurs, entrées, sorties, règles, références'),
    sections: () => T(
      ['Purpose', 'Actors', 'Inputs', 'Outputs', 'Rules', 'References'],
      ['Objectif', 'Acteurs', 'Entrées', 'Sorties', 'Règles', 'Références']),
  },
  {
    id: 'gateway',
    label: () => T('Gateway', 'Passerelle'),
    hint: () => T('Question asked, criterion of each branch', 'Question posée, critère de chaque branche'),
    sections: () => T(['Question asked', 'Criteria of the branches'], ['Question posée', 'Critères des branches']),
  },
  {
    id: 'start',
    label: () => T('Start event', 'Événement de début'),
    hint: () => T('Trigger, frequency, data received', 'Déclencheur, fréquence, données reçues'),
    sections: () => T(['Trigger', 'Frequency', 'Data received'], ['Déclencheur', 'Fréquence', 'Données reçues']),
  },
  {
    id: 'intermediate',
    label: () => T('Intermediate event', 'Événement intermédiaire'),
    hint: () => T('What is awaited or sent, time limit, if nothing happens', 'Ce qui est attendu ou émis, délai, si rien n\'arrive'),
    sections: () => T(['Awaited or sent', 'Time limit', 'If nothing happens'], ['Attendu ou émis', 'Délai', 'Si rien n\'arrive']),
  },
  {
    id: 'end',
    label: () => T('End event', 'Événement de fin'),
    hint: () => T('Result, recipient, follow-up', 'Résultat, destinataire, suite donnée'),
    sections: () => T(['Result', 'Recipient', 'Follow-up'], ['Résultat', 'Destinataire', 'Suite donnée']),
  },
  {
    id: 'process',
    label: () => T('Process', 'Processus'),
    hint: () => T('Purpose, scope, owner, triggers, indicators', 'Finalité, périmètre, propriétaire, déclencheurs, indicateurs'),
    sections: () => T(
      ['Purpose', 'Scope', 'Owner', 'Triggers', 'Indicators', 'References'],
      ['Finalité', 'Périmètre', 'Propriétaire', 'Déclencheurs', 'Indicateurs', 'Références']),
  },
]

// Modèle qui convient à l'élément (objet métier bpmn-moddle), ou celui d'une activité.
export function templateFor(bo) {
  if (is(bo, 'bpmn:Gateway')) return 'gateway'
  if (is(bo, 'bpmn:StartEvent')) return 'start'
  if (is(bo, 'bpmn:EndEvent')) return 'end'
  if (is(bo, 'bpmn:Event')) return 'intermediate'
  if (is(bo, 'bpmn:Process') || is(bo, 'bpmn:Participant') || is(bo, 'bpmn:Collaboration') || is(bo, 'bpmn:Lane')) return 'process'
  return 'activity'
}

// Texte du modèle. Pour une passerelle, une puce par branche sortante, à son nom.
export function templateText(id, bo) {
  const template = TEMPLATES.find((t) => t.id === id) || TEMPLATES[0]
  const sections = template.sections()
  const blocks = sections.map((title) => `## ${title}\n`)
  if (id === 'gateway') {
    const outgoing = bo?.outgoing?.length ? bo.outgoing : (bo?.$parent?.flowElements || []).filter((f) => f.sourceRef === bo)
    const branches = outgoing.map((f) => (f.name || f.targetRef?.name || '').trim()).filter(Boolean)
    if (branches.length) blocks[1] = `## ${sections[1]}\n${branches.map((b) => T(`- **${b}**: `, `- **${b}** : `)).join('\n')}\n`
  }
  return blocks.join('\n')
}
