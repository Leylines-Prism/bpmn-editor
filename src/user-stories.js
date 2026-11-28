// Récits utilisateur (user stories) et critères d'acceptation, par activité (mode Expert,
// module « Récits utilisateur »). Ils vivent dans le .bpmn (bpmnpilot:userStories et
// bpmnpilot:acceptanceCriteria, un par ligne), rédigés à la main dans le panneau ou par le
// Co-pilote (update_elements). Exporter > Récits utilisateur (Markdown) en fait un carnet
// prêt à reprendre dans un outil de suivi : une section par activité, dans l'ordre du flux,
// les critères en cases à cocher.
//
// Ce module ne dépend que du rapport de processus déjà calculé : il tourne dans les tests.

import { lang, T } from './i18n/lang.js'
import { identityMarkdown } from './process-report.js'

const colon = () => T(': ', ' : ')
const dateText = (date) => date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// Activités qui ont au moins un récit ou un critère.
export const activitiesWithStories = (report) =>
  report.sequence.filter((s) => s.activity && (s.userStories?.length || s.acceptanceCriteria?.length))

export function storiesToMarkdown(report) {
  const items = activitiesWithStories(report)
  const lines = [
    `# ${T('User stories', 'Récits utilisateur')}${colon()}${report.title}`,
    '',
    `*${T(`Generated on ${dateText(report.date)} by BPMN Pilot, from the activities of the process, in the order of the flow.`,
      `Générés le ${dateText(report.date)} par BPMN Pilot, à partir des activités du processus, dans l'ordre du flux.`)}*`,
  ]
  const identity = identityMarkdown(report.identity)
  if (identity.length) lines.push('', ...identity.slice(0, -1))
  const stories = items.reduce((n, s) => n + s.userStories.length, 0)
  const criteria = items.reduce((n, s) => n + s.acceptanceCriteria.length, 0)
  lines.push('', T(`${stories} user stories and ${criteria} acceptance criteria, for ${items.length} activities.`,
    `${stories} récit(s) utilisateur et ${criteria} critère(s) d'acceptation, pour ${items.length} activité(s).`))
  for (const s of items) {
    lines.push('', `## ${s.number}. ${s.name}`, '')
    const facts = []
    if (s.lane) facts.push(`**${T('Lane', 'Couloir')}**${colon()}${s.lane}`)
    if (s.assignee) facts.push(`**${T('Assigned to', 'Assigné à')}**${colon()}${s.assignee}`)
    if (s.systems) facts.push(`**${T('Systems', 'Systèmes')}**${colon()}${s.systems}`)
    if (facts.length) lines.push(facts.join(' · '), '')
    if (s.userStories.length) lines.push(`### ${T('User stories', 'Récits utilisateur')}`, '', ...s.userStories.map((t) => `- ${t}`), '')
    if (s.acceptanceCriteria.length) lines.push(`### ${T('Acceptance criteria', 'Critères d\'acceptation')}`, '', ...s.acceptanceCriteria.map((t) => `- [ ] ${t}`), '')
    while (lines[lines.length - 1] === '') lines.pop()
  }
  return lines.join('\n') + '\n'
}
