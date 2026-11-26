// Texte lisible d'un e-mail (.eml, format MIME) : en-têtes utiles, puis le corps en texte.
// Sans cela, le modèle recevrait le MIME brut : corps en base64 ou quoted-printable, doublons
// HTML, pièces jointes encodées, qui mangent le budget du message pour rien.
//
// Entrée : le fichier lu octet par octet dans une chaîne « binaire » (un caractère par octet),
// pour décoder chaque partie avec son propre jeu de caractères. Sans dépendance (testé sous Node).

const KEEP_HEADERS = ['from', 'to', 'cc', 'date', 'subject']
const MAX_DEPTH = 8

const bytesOf = (binary) => Uint8Array.from(binary, (c) => c.charCodeAt(0) & 0xff)

function decodeBytes(bytes, charset = 'utf-8') {
  const label = String(charset).trim().toLowerCase().replace(/^"|"$/g, '') || 'utf-8'
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

// En-têtes : lignes repliées réunies, noms en minuscules.
function parseHeaders(block) {
  const headers = {}
  for (const line of block.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n')) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    const name = line.slice(0, at).trim().toLowerCase()
    if (!(name in headers)) headers[name] = line.slice(at + 1).trim()
  }
  return headers
}

// Paramètre d'un en-tête : boundary, charset, name, filename.
function param(value = '', name) {
  const m = new RegExp(`${name}\\*?=\\s*("([^"]*)"|[^;\\s]+)`, 'i').exec(value)
  return m ? (m[2] ?? m[1]) : ''
}

// Mots encodés des en-têtes (RFC 2047) : =?utf-8?B?…?= et =?iso-8859-1?Q?…?=.
function decodeWords(value) {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (all, charset, enc, data) => {
      try {
        const binary = enc.toLowerCase() === 'b' ? atob(data) : qp(data.replace(/_/g, ' '))
        return decodeBytes(bytesOf(binary), charset)
      } catch {
        return all
      }
    })
}

// En-têtes encore en octets bruts (UTF-8 non encodé) : décodés en UTF-8.
const headerText = (value) => decodeWords(decodeBytes(bytesOf(value)))

const qp = (text) => text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))

function bodyBinary(body, encoding = '') {
  const enc = encoding.trim().toLowerCase()
  if (enc === 'base64') {
    try {
      return atob(body.replace(/[^A-Za-z0-9+/=]/g, ''))
    } catch {
      return body
    }
  }
  if (enc === 'quoted-printable') return qp(body)
  return body
}

// Texte d'un corps HTML, pour le modèle (jamais affiché comme du HTML). Lecture caractère par
// caractère plutôt que par remplacements successifs : une balise découpée ou imbriquée
// (« <scr<script>ipt> ») ne peut pas survivre, et le contenu de script, style et head est sauté.
const BREAK_TAGS = new Set(['br', 'p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'blockquote'])
const SKIP_TAGS = new Set(['script', 'style', 'head'])
const ENTITIES = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }

function decodeEntities(text) {
  return text.replace(/&(#\d{1,7}|[a-z]+);/gi, (all, code) => {
    if (code[0] === '#') {
      const n = Number(code.slice(1))
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
    }
    return ENTITIES[code.toLowerCase()] ?? all
  })
}

function htmlToText(html) {
  let out = ''
  let skip = null // balise dont on saute le contenu
  let i = 0
  while (i < html.length) {
    const open = html.indexOf('<', i)
    const text = open < 0 ? html.slice(i) : html.slice(i, open)
    if (!skip) out += decodeEntities(text)
    if (open < 0) break
    const close = html.indexOf('>', open + 1)
    if (close < 0) break // balise jamais refermée : la suite est ignorée
    const tag = html.slice(open + 1, close).trim()
    const closing = tag.startsWith('/')
    const name = (closing ? tag.slice(1) : tag).split(/[\s/]/)[0].toLowerCase()
    if (skip) {
      if (closing && name === skip) skip = null
    } else if (!closing && SKIP_TAGS.has(name)) {
      skip = name
    } else if (name === 'li' && !closing) {
      out += '- '
    } else if (name === 'td' || name === 'th') {
      if (closing) out += '\t'
    } else if (BREAK_TAGS.has(name) && (closing || name === 'br')) {
      out += '\n'
    }
    i = close + 1
  }
  return out.replace(/[ \t]+\n/g, '\n')
}

// Parcourt une partie MIME. Renvoie { plain: [], html: [], files: [] }.
function walk(raw, depth, out) {
  const split = raw.search(/\r?\n\r?\n/)
  const head = split < 0 ? raw : raw.slice(0, split)
  const body = split < 0 ? '' : raw.slice(split).replace(/^\r?\n\r?\n/, '')
  const headers = parseHeaders(head)
  const type = (headers['content-type'] || 'text/plain').split(';')[0].trim().toLowerCase()
  const disposition = (headers['content-disposition'] || '').toLowerCase()
  const fileName = param(headers['content-disposition'], 'filename') || param(headers['content-type'], 'name')

  if (type.startsWith('multipart/') && depth < MAX_DEPTH) {
    const boundary = param(headers['content-type'], 'boundary')
    if (boundary) {
      const parts = body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`))
      // Dans multipart/alternative, une seule version suffit : le texte, sinon le HTML.
      const sub = { plain: [], html: [], files: out.files }
      for (const part of parts.slice(1)) if (part.trim()) walk(part, depth + 1, sub)
      if (type === 'multipart/alternative') {
        if (sub.plain.length) out.plain.push(sub.plain.join('\n\n'))
        else out.plain.push(...sub.html.map(htmlToText))
      } else {
        out.plain.push(...sub.plain, ...sub.html.map(htmlToText))
      }
      return
    }
  }
  if (type === 'message/rfc822' && depth < MAX_DEPTH) {
    out.plain.push('--- Forwarded message ---\n' + emailBinaryToText(bodyBinary(body, headers['content-transfer-encoding']), depth + 1))
    return
  }
  if (disposition.startsWith('attachment') || (fileName && !type.startsWith('text/'))) {
    out.files.push(headerText(fileName || type))
    return
  }
  if (type !== 'text/plain' && type !== 'text/html') {
    if (fileName) out.files.push(headerText(fileName))
    return
  }
  const text = decodeBytes(bytesOf(bodyBinary(body, headers['content-transfer-encoding'])), param(headers['content-type'], 'charset') || 'utf-8')
  ;(type === 'text/html' ? out.html : out.plain).push(text)
}

function emailBinaryToText(binary, depth = 0) {
  const split = binary.search(/\r?\n\r?\n/)
  const headers = parseHeaders(split < 0 ? binary : binary.slice(0, split))
  const lines = KEEP_HEADERS.filter((h) => headers[h]).map((h) => `${h[0].toUpperCase()}${h.slice(1)}: ${headerText(headers[h])}`)
  const out = { plain: [], html: [], files: [] }
  walk(binary, depth, out)
  const body = [...out.plain, ...out.html.map(htmlToText)].join('\n\n').trim()
  const files = out.files.length ? `\n\nAttachments not included: ${out.files.join(', ')}` : ''
  return `${lines.join('\n')}\n\n${body}${files}`
}

// Un e-mail ? Des en-têtes au début, dont au moins un des habituels.
export const looksLikeEmail = (binary) => /^(?:[\w-]+:[^\n]*\r?\n(?:[ \t][^\n]*\r?\n)*)+/.test(binary) && /^(from|subject|date|mime-version|received|message-id):/im.test(binary.slice(0, 20000))

// bytes : Uint8Array du fichier .eml.
export function emailToText(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  if (!looksLikeEmail(binary)) return decodeBytes(bytes)
  return emailBinaryToText(binary)
}
