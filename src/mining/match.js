// Rapprochement des étapes du journal et des éléments du diagramme : nom identique, puis
// nom proche (casse, accents, ponctuation, distance d'édition). Le reste est à associer
// à la main, ou « hors modèle ».

export const normalize = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function distance(a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m || !n) return m || n
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}

// activities : noms des étapes ; elements : [{ id, name }].
// Renvoie { [activity]: { id, how: 'exact' | 'close' } | null }.
export function matchActivities(activities, elements) {
  const named = elements.filter((e) => normalize(e.name))
  const out = {}
  const taken = new Set()
  for (const a of activities) {
    const na = normalize(a)
    const exact = named.find((e) => !taken.has(e.id) && normalize(e.name) === na)
    if (exact) { out[a] = { id: exact.id, how: 'exact' }; taken.add(exact.id) }
  }
  for (const a of activities) {
    if (out[a]) continue
    const na = normalize(a)
    let best = null
    for (const e of named) {
      if (taken.has(e.id)) continue
      const ne = normalize(e.name)
      const d = distance(na, ne)
      const limit = Math.max(1, Math.floor(Math.max(na.length, ne.length) * 0.2))
      const contains = na.length >= 4 && ne.length >= 4 && (na.includes(ne) || ne.includes(na))
      if ((d <= limit || contains) && (!best || d < best.d)) best = { e, d }
    }
    if (best) { out[a] = { id: best.e.id, how: 'close' }; taken.add(best.e.id) } else out[a] = null
  }
  return out
}
