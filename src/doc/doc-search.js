// Recherche dans le diagramme (Ctrl+F, ou la loupe du canevas) : la recherche de bpmn-js
// regarde les libellés et les identifiants ; celle-ci regarde aussi la documentation. Le
// résultat montre, sous le libellé, l'extrait de documentation qui correspond.

import { getLabel, isLabel } from 'bpmn-js/lib/util/LabelUtil'
import { markdownToLine } from './markdown.js'
import { docText } from './documentation.js'

const BEFORE = 30
const AFTER = 70

// Extrait autour du plus long passage trouvé : les morceaux (tokens) de la recherche,
// coupés pour tenir sur une ligne.
export function snippet(tokens) {
  const flat = (tokens || []).flat()
  let first = -1
  flat.forEach((t, i) => { if (t.match && (first < 0 || t.value.length > flat[first].value.length)) first = i })
  if (first < 0) return []
  let start = 0
  for (let i = 0; i < first; i++) start += flat[i].value.length
  const from = Math.max(0, start - BEFORE)
  const total = flat.reduce((n, t) => n + t.value.length, 0)
  const to = Math.min(total, start + flat[first].value.length + AFTER)
  const out = []
  let pos = 0
  for (const t of flat) {
    const a = Math.max(from, pos)
    const b = Math.min(to, pos + t.value.length)
    if (b > a) out.push({ ...t, value: t.value.slice(a - pos, b - pos) })
    pos += t.value.length
  }
  if (from > 0 && out[0]) out[0] = { ...out[0], value: '…' + out[0].value.replace(/^\S*\s/, '') }
  if (to < total && out.length) {
    const last = out[out.length - 1]
    out[out.length - 1] = { ...last, value: last.value.replace(/\s\S*$/, '') + '…' }
  }
  return out
}

export function setupDocSearch(modeler) {
  const elementRegistry = modeler.get('elementRegistry')
  const canvas = modeler.get('canvas')
  const search = modeler.get('search')
  const searchPad = modeler.get('searchPad')

  searchPad.registerProvider({
    find(pattern) {
      const roots = canvas.getRootElements()
      const items = elementRegistry
        .filter((e) => !isLabel(e) && !roots.includes(e))
        .map((element) => ({
          element,
          label: getLabel(element) || '',
          id: element.id,
          doc: markdownToLine(docText(element.businessObject)),
        }))
      return search(items, pattern, { keys: ['label', 'id', 'doc'] }).map(({ item, tokens }) => {
        const inDoc = (tokens.doc || []).flat().some((t) => t.match)
        const inLabel = (tokens.label || []).flat().some((t) => t.match)
        return {
          element: item.element,
          primaryTokens: inLabel || !item.label ? tokens.label : [{ value: item.label }],
          secondaryTokens: inDoc ? snippet(tokens.doc) : tokens.id,
        }
      })
    },
  })

  return { open: () => searchPad.open() }
}
