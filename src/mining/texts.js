// Textes communs à l'analyse de journal : durées, dates et écarts, dans la langue de
// l'interface. Repris par le panneau du canevas, le rapport de processus et les outils.

import { T, lang } from '../i18n/lang.js'

const locale = () => (lang === 'fr' ? 'fr-FR' : 'en-US')

export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '–'
  const min = ms / 60000
  const one = (x) => x.toLocaleString(locale(), { maximumFractionDigits: 1 })
  if (min < 1) return '< 1 min'
  if (min < 90) return `${Math.round(min)} min`
  const h = min / 60
  if (h < 48) return `${one(h)} h`
  return T(`${one(h / 24)} d`, `${one(h / 24)} j`)
}

export function formatDate(ms) {
  return new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

export const formatShare = (x) => `${Math.round(x * 100)} %`

// Un écart, en une phrase. nameOf(id) : nom de l'élément.
export function deviationText(d, nameOf) {
  const n = (id) => nameOf(id)
  switch (d.kind) {
    case 'skipped': return T(`“${n(d.element)}” skipped`, `« ${n(d.element)} » sautée`)
    case 'order': return T(`“${n(d.element)}” done before “${n(d.other)}”`, `« ${n(d.element)} » faite avant « ${n(d.other)} »`)
    case 'unexpected': return T(`“${n(d.element)}” without the expected step before`, `« ${n(d.element)} » sans l'étape prévue avant`)
    case 'unfinished': return d.element ? T(`Stopped after “${n(d.element)}”`, `Arrêtés après « ${n(d.element)} »`) : T('Not finished', 'Non terminés')
    case 'outside': return T(`“${d.activity}” (not in the diagram)`, `« ${d.activity} » (hors modèle)`) + (d.after ? T(` after “${n(d.after)}”`, ` après « ${n(d.after)} »`) : '')
    default: return d.kind
  }
}
