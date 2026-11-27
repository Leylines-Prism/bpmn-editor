// Fichiers lus comme du texte pour le co-pilote : formats texte (JSON, CSV, XML, BPMN,
// Markdown…) et documents bureautiques (Word, Writer, PowerPoint, Excel, Calc), dont on
// extrait le texte dans la page. Le texte part avec le message : tous les fournisseurs
// le lisent, et rien ne quitte le navigateur à part ce message.
//
// Les documents bureautiques sont des archives zip de fichiers XML. On les ouvre ici,
// sans dépendance : répertoire central du zip, DecompressionStream, puis un parcours
// simple des balises XML (le code tourne aussi sous Node, pour les tests).

import { emailToText } from './email-text.js'

export const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'bpmn', 'html', 'htm', 'yaml', 'yml', 'log', 'eml']
export const OFFICE_EXTENSIONS = ['docx', 'odt', 'pptx', 'odp', 'xlsx', 'ods']
const TEXT_TYPES = ['application/json', 'application/xml', 'application/yaml', 'message/rfc822']

// Pour l'attribut accept des champs fichier.
export const TEXT_FILE_ACCEPT = [...TEXT_EXTENSIONS, ...OFFICE_EXTENSIONS].map((e) => `.${e}`).join(',')

export const MAX_OFFICE_BYTES = 20 * 1024 * 1024
const MAX_COLUMNS = 200 // colonnes lues par ligne de tableur
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024 // garde-fou contre une archive piégée

const extension = (name = '') => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase()

// 'text', 'office' ou null.
export function textFileKind(file) {
  const ext = extension(file.name)
  if (OFFICE_EXTENSIONS.includes(ext)) return 'office'
  if (TEXT_EXTENSIONS.includes(ext)) return 'text'
  const type = (file.type || '').split(';')[0]
  if (type.startsWith('text/') || TEXT_TYPES.includes(type) || /\+(json|xml)$/.test(type)) return 'text'
  return null
}

// Texte d'un fichier (File ou Blob avec un nom). Lève une erreur lisible sinon.
export async function fileToText(file) {
  const kind = textFileKind(file)
  if (kind === 'text' && (extension(file.name) === 'eml' || (file.type || '').startsWith('message/rfc822'))) {
    return clean(emailToText(new Uint8Array(await file.arrayBuffer())))
  }
  if (kind === 'text') return clean(await file.text())
  if (kind !== 'office') throw new Error('unsupported file type')
  if (file.size > MAX_OFFICE_BYTES) throw new Error('file too large')
  const zip = await openZip(new Uint8Array(await file.arrayBuffer()))
  const ext = extension(file.name)
  const text = ext === 'docx' ? await docxText(zip)
    : ext === 'pptx' ? await pptxText(zip)
    : ext === 'xlsx' ? await xlsxText(zip)
    : await odfText(zip, ext)
  return clean(text)
}

// Le texte des fichiers, ajouté au message envoyé au modèle.
export function withTextFiles(text, files) {
  if (!files.length) return text
  const blocks = files.map((f) => {
    const name = String(f.name || 'file').replace(/[\r\n]+/g, ' ')
    return `--- Attached file: ${name} ---\n${f.text}\n--- End of attached file ---`
  })
  return `${text}\n\n${blocks.join('\n\n')}`
}

function clean(text) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Zip ─────────────────────────────────────────────────────────────────────

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// Renvoie { names, read(name) → texte ou null }.
export async function openZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('not a valid document (zip)')
  const count = view.getUint16(end + 10, true)
  let p = view.getUint32(end + 16, true)
  const entries = new Map()
  const decoder = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('not a valid document (zip)')
    const method = view.getUint16(p + 10, true)
    const size = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const offset = view.getUint32(p + 42, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries.set(name, { method, size, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  let unzipped = 0
  return {
    names: [...entries.keys()],
    async read(name) {
      const e = entries.get(name)
      if (!e) return null
      if (e.offset + 30 > bytes.length || view.getUint32(e.offset, true) !== 0x04034b50) throw new Error('not a valid document (zip)')
      const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true)
      // La taille dans l'en-tête local peut manquer : on prend celle du répertoire central.
      const sizeC = new DataView(bytes.buffer, bytes.byteOffset).getUint32(e.offset + 18, true)
      const data = e.method === 0 ? bytes.subarray(start, start + e.size) : e.method === 8 ? await inflate(bytes.subarray(start, start + (sizeC || bytes.length - start))) : null
      if (!data) throw new Error('unsupported compression')
      unzipped += data.length
      if (unzipped > MAX_UNZIPPED_BYTES) throw new Error('document too large once unpacked')
      return decoder.decode(data)
    },
  }
}

// ── XML ─────────────────────────────────────────────────────────────────────

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
export const decodeXml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e] ?? m
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })

const attr = (attrs, name) => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attrs)
  return m ? decodeXml(m[2] ?? m[3]) : null
}

const TOKEN = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<[?!][^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g

// Parcourt un XML et en garde le texte. rules : ensembles de noms de balises.
//  text : balises dont le contenu est du texte ; para : fin de paragraphe ;
//  cell / row : cellules et lignes de tableau ; tab, br, space : marques en ligne ;
//  skip : balises dont on ignore le contenu ; open(name, attrs) : texte à l'ouverture.
function xmlText(xml, rules) {
  const has = (set, name) => set?.includes(name)
  // Le texte est gardé ligne par ligne : les retouches de fin de ligne restent courtes.
  const lines = []
  let line = ''
  const newline = () => {
    lines.push(line)
    line = ''
  }
  let inText = 0
  let skip = 0
  let cells = 0
  TOKEN.lastIndex = 0
  for (let m; (m = TOKEN.exec(xml));) {
    const [, cdata, closing, name, attrs, selfClosing, chars] = m
    if (cdata !== undefined || chars !== undefined) {
      if (inText && !skip) line += cdata ?? decodeXml(chars)
      continue
    }
    if (!name) continue
    if (has(rules.skip, name)) {
      if (!selfClosing) skip += closing ? -1 : 1
      continue
    }
    if (skip) continue
    if (!closing) {
      if (rules.open) line += rules.open(name, attrs) || ''
      if (has(rules.tab, name)) line += '\t'
      else if (has(rules.br, name)) line += '\n'
      else if (has(rules.space, name)) line += ' '.repeat(Math.min(Number(attr(attrs, 'text:c')) || 1, 100))
      if (has(rules.cell, name) && !selfClosing) cells++
      if (has(rules.text, name) && !selfClosing) inText++
      if (selfClosing && has(rules.cell, name)) line += ' | '.repeat(Math.min(Number(attr(attrs, 'table:number-columns-repeated')) || 1, MAX_COLUMNS))
      continue
    }
    if (has(rules.text, name)) inText = Math.max(0, inText - 1)
    if (has(rules.para, name)) {
      if (cells) line += ' '
      else newline()
    }
    if (has(rules.cell, name)) {
      cells = Math.max(0, cells - 1)
      line = line.trimEnd() + ' | '
    }
    if (has(rules.row, name)) {
      line = trimCells(line)
      newline()
    }
  }
  lines.push(line)
  return lines.join('\n')
}

// Retire les séparateurs de cellules vides en fin de ligne.
function trimCells(line) {
  let t = line.trimEnd()
  while (t.endsWith('|')) t = t.slice(0, -1).trimEnd()
  return t
}

// ── Formats ─────────────────────────────────────────────────────────────────

async function docxText(zip) {
  const xml = await zip.read('word/document.xml')
  if (xml === null) throw new Error('not a Word document')
  return xmlText(xml, {
    text: ['w:t'],
    para: ['w:p'],
    cell: ['w:tc'],
    row: ['w:tr'],
    tab: ['w:tab'],
    br: ['w:br', 'w:cr'],
    skip: ['w:pPr', 'w:rPr', 'w:instrText', 'w:del'],
  })
}

const byNumber = (re) => (a, b) => Number(re.exec(a)[1]) - Number(re.exec(b)[1])

async function pptxText(zip) {
  const re = /^ppt\/slides\/slide(\d+)\.xml$/
  const slides = zip.names.filter((n) => re.test(n)).sort(byNumber(re))
  if (!slides.length) throw new Error('not a PowerPoint presentation')
  const parts = []
  for (const [i, name] of slides.entries()) {
    const text = xmlText(await zip.read(name), { text: ['a:t'], para: ['a:p'], cell: ['a:tc'], row: ['a:tr'], br: ['a:br'] })
    parts.push(`## Slide ${i + 1}\n${text.trim()}`)
  }
  return parts.join('\n\n')
}

// Index d'une colonne Excel : A → 0, Z → 25, AA → 26.
const columnIndex = (ref) => [...(/^[A-Z]+/.exec(ref || '')?.[0] || '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1


// Feuilles d'un classeur Excel : [{ name, rows: [[cellule, …], …] }].
export async function xlsxSheets(zip) {
  const workbook = await zip.read('xl/workbook.xml')
  if (workbook === null) throw new Error('not an Excel workbook')
  const shared = []
  const sst = await zip.read('xl/sharedStrings.xml')
  if (sst) {
    for (const [, si] of sst.matchAll(/<si>([\s\S]*?)<\/si>/g))
      shared.push(xmlText(si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''), { text: ['t'] }))
  }
  const rels = new Map()
  for (const [, a] of ((await zip.read('xl/_rels/workbook.xml.rels')) || '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const target = attr(a, 'Target') || ''
    rels.set(attr(a, 'Id'), target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }
  const parts = []
  for (const [, a] of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const path = rels.get(attr(a, 'r:id'))
    const xml = path && (await zip.read(path))
    if (!xml) continue
    const rows = []
    for (const [, row] of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const cells = []
      for (const [, ca, content = ''] of (row || '').matchAll(/<c\b((?:[^>"']|"[^"]*"|'[^']*')*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = columnIndex(attr(ca, 'r'))
        if (col >= MAX_COLUMNS) continue
        const type = attr(ca, 't')
        const v = /<v>([\s\S]*?)<\/v>/.exec(content)?.[1]
        let value =
          type === 's' ? shared[Number(v)] ?? ''
          : type === 'inlineStr' ? xmlText(content, { text: ['t'] })
          : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE')
          : v !== undefined ? decodeXml(v) : ''
        value = value.replace(/\s*\n\s*/g, ' ').trim()
        cells[col >= 0 ? col : cells.length] = value
      }
      while (cells.length && !cells[cells.length - 1]) cells.pop()
      if (cells.length) rows.push(Array.from(cells, (c) => c ?? ''))
    }
    parts.push({ name: attr(a, 'name') || '', rows })
  }
  return parts
}

async function xlsxText(zip) {
  return (await xlsxSheets(zip))
    .map((s) => `## Sheet: ${s.name}\n${s.rows.map((r) => r.join(' | ')).join('\n')}`)
    .join('\n\n')
}

async function odfText(zip, ext) {
  const xml = await zip.read('content.xml')
  if (xml === null) throw new Error('not an OpenDocument file')
  let slide = 0
  return xmlText(xml, {
    text: ['text:p', 'text:h'],
    para: ['text:p', 'text:h'],
    cell: ['table:table-cell', 'table:covered-table-cell'],
    row: ['table:table-row'],
    tab: ['text:tab'],
    br: ['text:line-break'],
    space: ['text:s'],
    skip: ['office:annotation', 'text:tracked-changes', 'office:forms'],
    open: (name, attrs) => {
      if (ext === 'ods' && name === 'table:table') return `\n## Sheet: ${attr(attrs, 'table:name') || ''}\n`
      if (ext === 'odp' && name === 'draw:page') return `\n## Slide ${++slide}\n`
      return ''
    },
  })
}
