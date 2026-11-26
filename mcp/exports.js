// Exports enregistrés sur le serveur (version docker) : le menu Exporter de l'éditeur peut
// déposer ses fichiers (.bpmn, .xml, SVG, PNG, PDF, rapport de processus en Markdown) dans ce dossier,
// sous le nom du diagramme.
// Un fichier existant n'est jamais remplacé : « Mon processus (2).pdf » s'ajoute à côté.
// Le dossier est monté par docker-compose, ou mcp/data/exports en développement.

import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { DIR_MODE, createUnique, safeBaseName } from './files.js'

export const MAX_EXPORT_BYTES = 20 * 1024 * 1024

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const utf8 = new TextDecoder('utf-8', { fatal: true })

// Texte UTF-8 valide qui commence par une balise XML (après un éventuel BOM).
function xmlText(buf) {
  try {
    const text = utf8.decode(buf).replace(/^\uFEFF/, '').trimStart()
    return text.startsWith('<') ? text : null
  } catch {
    return null
  }
}

// Formats acceptés et contrôle du contenu reçu : le fichier doit être ce que son extension annonce.
export const FORMATS = {
  bpmn: (buf) => /<([\w-]+:)?definitions[\s>]/.test(xmlText(buf) ?? ''),
  xml: (buf) => /<([\w-]+:)?definitions[\s>]/.test(xmlText(buf) ?? ''),
  svg: (buf) => /<svg[\s>]/.test(xmlText(buf) ?? ''),
  png: (buf) => buf.length > PNG.length && buf.subarray(0, PNG.length).equals(PNG),
  pdf: (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-',
  // Rapport de processus : texte UTF-8 valide, sans caractère nul.
  md: (buf) => {
    try {
      return !utf8.decode(buf).includes('\0')
    } catch {
      return false
    }
  },
}

export function exportsDir() {
  return process.env.EXPORTS_DIR || fileURLToPath(new URL('./data/exports', import.meta.url))
}

export class ExportStore {
  constructor(dir = exportsDir()) {
    this.dir = dir
    this.ready = mkdir(dir, { recursive: true, mode: DIR_MODE })
    this.ready.catch(() => {})
  }

  static validFormat(format) {
    return typeof format === 'string' && Object.hasOwn(FORMATS, format)
  }

  static validContent(format, buf) {
    return ExportStore.validFormat(format) && Buffer.isBuffer(buf) && buf.length > 0 && buf.length <= MAX_EXPORT_BYTES && FORMATS[format](buf)
  }

  // Enregistre le fichier et renvoie le nom retenu.
  async save(name, format, buf) {
    await this.ready
    return createUnique(this.dir, safeBaseName(name), format, buf)
  }
}
