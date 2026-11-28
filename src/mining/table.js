// Lecture d'un journal d'événements (event log) en CSV : séparateur deviné, guillemets à
// la manière de RFC 4180, première ligne d'en-têtes. Tout se passe dans la page.

const SEPARATORS = [';', ',', '\t', '|']

// Séparateur le plus régulier sur les premières lignes : présent, et en même nombre partout.
export function detectSeparator(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20)
  let best = ','
  let bestScore = -1
  for (const sep of SEPARATORS) {
    const counts = lines.map((l) => splitLine(l, sep).length)
    if (!counts.length || counts[0] < 2) continue
    const same = counts.filter((c) => c === counts[0]).length
    const score = same * 100 + counts[0]
    if (score > bestScore) { best = sep; bestScore = score }
  }
  return best
}

function splitLine(line, sep) {
  return parseRows(line, sep)[0] || []
}

// Analyse complète, guillemets doublés et retours à la ligne dans un champ compris.
export function parseRows(text, sep) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

// { headers, rows, separator } : rows sans la ligne d'en-têtes.
export function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const separator = detectSeparator(clean)
  const all = parseRows(clean, separator)
  if (all.length < 2) throw new Error('empty')
  const headers = all[0].map((h, i) => h.trim() || `#${i + 1}`)
  const rows = all.slice(1).map((r) => headers.map((_, i) => (r[i] ?? '').trim()))
  return { headers, rows, separator }
}

// Colonnes devinées d'après les en-têtes : identifiant du cas, activité, début, fin,
// ressource. Une colonne non trouvée vaut -1.
const HINTS = {
  case: [/^case\s*:?\s*(id|concept:name)?$/i, /case[\s_:-]*id/i, /\bcase\b/i, /\bcas\b/i, /dossier/i, /commande/i, /order/i, /ticket/i, /\bid\b/i, /num(é|e)ro/i],
  activity: [/^activity$/i, /concept:name/i, /activit/i, /(é|e)tape/i, /\bstep\b/i, /\btask\b/i, /t(â|a)che/i, /event/i, /(é|e)v(é|e)nement/i, /action/i, /status|statut/i],
  start: [/start/i, /d(é|e)but/i, /begin/i],
  end: [/complete|end\b|fin\b|finish/i, /time:timestamp/i, /timestamp/i, /horodatage/i, /\bdate\b/i, /\btime\b/i, /heure/i],
  resource: [/org:resource/i, /resource/i, /ressource/i, /\buser\b/i, /utilisateur/i, /agent/i, /owner/i, /responsable/i, /acteur/i],
}

export function guessColumns(headers) {
  const used = new Set()
  const pick = (key) => {
    for (const re of HINTS[key]) {
      const i = headers.findIndex((h, j) => !used.has(j) && re.test(h))
      if (i >= 0) { used.add(i); return i }
    }
    return -1
  }
  // L'ordre compte : le cas et l'activité d'abord, puis les dates.
  const activity = pick('activity')
  const caseCol = pick('case')
  const start = pick('start')
  const end = pick('end')
  const resource = pick('resource')
  return { case: caseCol, activity, start, end: end >= 0 ? end : -1, resource }
}
