// Textes des décisions DMN dans la langue de l'interface : constats, politique de résultat,
// résumé d'une table. Servent au panneau, au rapport de processus et à la fenêtre DMN.
import { lang, T, num } from '../i18n/lang.js'

export const findingText = (f) => (lang === 'fr' && f.fr ? f.fr : f.text)
export const checkTexts = (findings) => findings.map((f) => ({ ...f, text: findingText(f) }))

export const HIT_POLICY_LABELS = {
  'UNIQUE': ['Unique', 'Unique'],
  'FIRST': ['First', 'Première'],
  'PRIORITY': ['Priority', 'Priorité'],
  'ANY': ['Any', 'Toutes'],
  'COLLECT': ['Collect', 'Collecte'],
  'RULE ORDER': ['Rule order', 'Ordre des règles'],
  'OUTPUT ORDER': ['Output order', 'Ordre des sorties'],
}
export const hitPolicyLabel = (d) => {
  const [en, fr] = HIT_POLICY_LABELS[d.hitPolicy] || [d.hitPolicy, d.hitPolicy]
  return T(en, fr) + (d.aggregation ? ` (${d.aggregation})` : '')
}

export function describeTable(d) {
  if (d.kind !== 'table') return d.kind === 'literal' ? T('Literal expression', 'Expression littérale') : T('No decision logic yet', 'Pas encore de logique de décision')
  const n = (count, en1, enN, fr1, frN) => `${num(count)} ${count > 1 ? T(enN, frN) : T(en1, fr1)}`
  return [
    T('Decision table', 'Table de décision'),
    n(d.inputs.length, 'input', 'inputs', 'entrée', 'entrées'),
    n(d.outputs.length, 'output', 'outputs', 'sortie', 'sorties'),
    n(d.rules.length, 'rule', 'rules', 'règle', 'règles'),
    T('hit policy ', 'politique ') + hitPolicyLabel(d),
  ].join(' · ')
}

