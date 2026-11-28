// Horodatages d'un journal : ISO 8601, « AAAA-MM-JJ HH:MM[:SS] », « JJ/MM/AAAA HH:MM »
// (ou MM/JJ/AAAA quand le premier nombre dépasse 12 ailleurs dans la colonne), ou nombre
// (secondes ou millisecondes depuis 1970). Sans fuseau, l'heure est lue en heure locale.

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3})\d*)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/
const SLASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

// Ordre jour/mois pour une colonne : 'dmy' sauf si un deuxième nombre dépasse 12.
export function detectDayOrder(values) {
  for (const v of values) {
    const m = SLASH.exec(String(v).trim())
    if (!m) continue
    if (Number(m[1]) > 12) return 'dmy'
    if (Number(m[2]) > 12) return 'mdy'
  }
  return 'dmy'
}

export function parseTimestamp(value, order = 'dmy') {
  const s = String(value ?? '').trim()
  if (!s) return null
  let m = ISO.exec(s)
  if (m) {
    if (m[8]) {
      const t = Date.parse(s.replace(' ', 'T'))
      return Number.isFinite(t) ? t : null
    }
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +(m[7] || 0).toString().padEnd(3, '0')).getTime()
  }
  m = SLASH.exec(s)
  if (m) {
    let [d, mo] = order === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]]
    let y = +m[3]
    if (y < 100) y += 2000
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    return new Date(y, mo - 1, d, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime()
  }
  if (/^\d{9,13}(\.\d+)?$/.test(s)) {
    const n = Number(s)
    return n < 1e11 ? n * 1000 : n
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}
