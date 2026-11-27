// Markdown du champ Documentation : un sous-ensemble lu sans bibliothèque, pour l'aperçu
// de la fenêtre de documentation, les fiches du mode Présentation, le rapport de processus
// et les fiches de procédure.
//
// Le texte vient du fichier ouvert : il n'est jamais injecté tel quel dans la page. Tout
// passe par l'échappement HTML, et un lien ne garde son adresse que si elle commence par
// http://, https:// ou mailto:.
//
// Reconnu : titres (# à ######), listes à puces (-, *, +) et numérotées (1. ou 1)) sur
// deux niveaux, citations (>), paragraphes (un retour à la ligne y reste un retour à la
// ligne, pour qu'un texte brut garde sa forme), **gras**, *italique*, `code`, [lien](url)
// et adresses nues en https://.

const SAFE_URL = /^(https?:\/\/|mailto:)[^\s<>"']+$/i

export function safeUrl(url) {
  const value = String(url || '').trim()
  return SAFE_URL.test(value) ? value : null
}

// ── Lignes et blocs ─────────────────────────────────────────────────────────

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/

// Blocs : { type: 'heading', level, text } | { type: 'paragraph', lines } |
// { type: 'list', ordered, start, items: [{ text, depth }] } | { type: 'quote', lines }.
export function parseBlocks(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let current = null
  const close = () => { current = null }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) { close(); continue }
    let m
    if ((m = line.match(HEADING)) && !/^\s/.test(line)) {
      close()
      blocks.push({ type: 'heading', level: m[1].length, text: m[2] })
      continue
    }
    const bullet = line.match(BULLET)
    const ordered = !bullet && line.match(ORDERED)
    if (bullet || ordered) {
      const indent = (bullet || ordered)[1].replace(/\t/g, '  ').length
      const isOrdered = !!ordered
      const text = bullet ? bullet[2] : ordered[3]
      const depth = indent >= 2 ? 1 : 0
      // Une sous-liste reste dans la liste qui la porte, même d'une autre sorte.
      if (current?.type === 'list' && (current.ordered === isOrdered || depth > 0)) {
        current.items.push({ text, depth })
      } else {
        current = { type: 'list', ordered: isOrdered, start: ordered ? Number(ordered[2]) : 1, items: [{ text, depth }] }
        blocks.push(current)
      }
      continue
    }
    if ((m = line.match(QUOTE))) {
      if (current?.type !== 'quote') { current = { type: 'quote', lines: [] }; blocks.push(current) }
      current.lines.push(m[1])
      continue
    }
    // Ligne de suite d'un élément de liste (indentée) : elle rejoint l'élément.
    if (current?.type === 'list' && /^\s{2,}/.test(raw)) {
      const last = current.items[current.items.length - 1]
      last.text += ' ' + line.trim()
      continue
    }
    if (current?.type !== 'paragraph') { current = { type: 'paragraph', lines: [] }; blocks.push(current) }
    current.lines.push(line.trim())
  }
  return blocks
}

// ── Texte en ligne ──────────────────────────────────────────────────────────

// Morceaux : { text, bold?, italic?, code?, href? }. Un lien à l'adresse refusée garde
// son texte, sans adresse.
export function parseInline(text) {
  const out = []
  const push = (piece, style) => {
    if (!piece) return
    const last = out[out.length - 1]
    if (last && !last.code && !last.href && !style.code && !style.href && !!last.bold === !!style.bold && !!last.italic === !!style.italic) {
      last.text += piece
    } else out.push({ text: piece, ...style })
  }
  walk(String(text ?? ''), {}, push)
  return out
}

const INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1|\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\s](?:[^*]*[^*\s])?)\*|(?<![\p{L}\p{N}])_([^_\s](?:[^_]*[^_\s])?)_(?![\p{L}\p{N}])|(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/u

function walk(text, style, push) {
  let rest = text
  while (rest) {
    const m = rest.match(INLINE)
    if (!m) { push(unescape(rest), style); return }
    push(unescape(rest.slice(0, m.index)), style)
    if (m[2] !== undefined) push(m[2], { code: true })
    else if (m[3] !== undefined) {
      const href = safeUrl(m[4])
      if (href) {
        const inner = []
        walk(m[3], style, (t, s) => inner.push({ text: t, ...s }))
        for (const piece of inner) pushRaw(push, piece, href)
      } else walk(m[3], style, push)
    } else if (m[5] !== undefined || m[6] !== undefined) walk(m[5] ?? m[6], { ...style, bold: true }, push)
    else if (m[7] !== undefined || m[8] !== undefined) walk(m[7] ?? m[8], { ...style, italic: true }, push)
    else if (m[9] !== undefined) pushRaw(push, { text: m[9] }, safeUrl(m[9]))
    rest = rest.slice(m.index + m[0].length)
  }
}

function pushRaw(push, piece, href) {
  const { text, ...style } = piece
  push(text, href ? { ...style, href } : style)
}

// Barre oblique inverse devant un caractère de mise en forme : le caractère tel quel.
const unescape = (s) => s.replace(/\\([\\`*_[\]()#+\-.!>])/g, '$1')

// ── HTML ────────────────────────────────────────────────────────────────────

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c])

export function inlineToHtml(text) {
  return parseInline(text).map((p) => {
    let html = escapeHtml(p.text)
    if (p.code) return `<code>${html}</code>`
    if (p.italic) html = `<em>${html}</em>`
    if (p.bold) html = `<strong>${html}</strong>`
    if (p.href) html = `<a href="${escapeHtml(p.href)}" target="_blank" rel="noopener noreferrer">${html}</a>`
    return html
  }).join('')
}

// headingOffset : décale les titres (le titre 1 d'une documentation devient un titre 3
// dans une fiche, par exemple).
export function markdownToHtml(source, { headingOffset = 0 } = {}) {
  return parseBlocks(source).map((b) => {
    if (b.type === 'heading') {
      const level = Math.min(6, b.level + headingOffset)
      return `<h${level}>${inlineToHtml(b.text)}</h${level}>`
    }
    if (b.type === 'paragraph') return `<p>${b.lines.map(inlineToHtml).join('<br>')}</p>`
    if (b.type === 'quote') return `<blockquote>${b.lines.map(inlineToHtml).join('<br>')}</blockquote>`
    return listToHtml(b)
  }).join('\n')
}

function listToHtml(list) {
  const tag = list.ordered ? 'ol' : 'ul'
  const open = list.ordered && list.start !== 1 ? `<ol start="${list.start}">` : `<${tag}>`
  let html = open
  let inSub = false
  list.items.forEach((item, i) => {
    if (item.depth > 0 && i > 0) {
      if (!inSub) { html += '<ul>'; inSub = true }
      html += `<li>${inlineToHtml(item.text)}</li>`
      return
    }
    if (inSub) { html += '</ul>'; inSub = false }
    if (i > 0) html += '</li>'
    html += `<li>${inlineToHtml(item.text)}`
  })
  if (inSub) html += '</ul>'
  return `${html}</li></${tag}>`
}

// ── Texte brut ──────────────────────────────────────────────────────────────

export const inlineToPlain = (text) => parseInline(text).map((p) => (p.href && p.href !== p.text ? `${p.text} (${p.href})` : p.text)).join('')
const inlineToShort = (text) => parseInline(text).map((p) => p.text).join('')

// Sur une ligne, pour une cellule de tableau ou une infobulle : « Objectif : … · Acteurs :
// a, b ». Les adresses des liens n'y figurent pas.
export function markdownToLine(source) {
  const parts = []
  let heading = null
  for (const b of parseBlocks(source)) {
    if (b.type === 'heading') {
      if (heading) parts.push(heading)
      heading = inlineToShort(b.text)
      continue
    }
    const text = b.type === 'list'
      ? b.items.map((it) => inlineToShort(it.text)).join(', ')
      : b.lines.map(inlineToShort).join(' ')
    parts.push(heading ? `${heading} : ${text}` : text)
    heading = null
  }
  if (heading) parts.push(heading)
  return parts.join(' · ').replace(/\s+/g, ' ').trim()
}

// Sur plusieurs lignes, pour un PDF : titres seuls sur leur ligne, puces « • ».
export function markdownToPlain(source) {
  const out = []
  for (const b of parseBlocks(source)) {
    if (b.type === 'heading') out.push(inlineToPlain(b.text))
    else if (b.type === 'list') {
      let n = b.start
      for (const it of b.items) out.push(`${it.depth ? '    - ' : b.ordered ? `${n++}. ` : '• '}${inlineToPlain(it.text)}`)
    }
    else out.push(...b.lines.map(inlineToPlain))
  }
  return out.join('\n')
}

// Les titres d'une documentation, décalés pour s'insérer dans un document Markdown plus
// grand (rapport, fiches) sans casser sa hiérarchie.
export function shiftHeadings(source, offset) {
  return String(source ?? '').replace(/^(#{1,6})(?=\s)/gm, (h) => '#'.repeat(Math.min(6, h.length + offset)))
}
