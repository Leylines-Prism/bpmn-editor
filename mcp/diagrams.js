// Diagrammes enregistrés sur le serveur (« Mes diagrammes », version docker).
//
// Chaque diagramme est un fichier .bpmn (ou .dmn pour un modèle de décision, mode Expert) qui porte son nom dans l'éditeur (« Mon processus.bpmn »,
// ou « Mon processus (2).bpmn » si le nom est pris), pour qu'on le retrouve dans un explorateur
// de fichiers. Renommer le diagramme renomme le fichier. L'index caché .index.json relie
// l'identifiant de chaque diagramme à son fichier et à son nom. Un .bpmn déposé à la main dans le
// dossier apparaît dans la liste.
// Le dossier est monté par docker-compose, ou mcp/data/diagrams en développement.

import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DIR_MODE, FILE_MODE, createUnique, safeBaseName } from './files.js'

export const MAX_XML_BYTES = 10 * 1024 * 1024
const MAX_NAME = 120
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const INDEX = '.index.json'
const EXT = 'bpmn'
// Genres de fichiers rangés : processus BPMN et modèles de décision DMN.
export const KINDS = { bpmn: 'bpmn', dmn: 'dmn' }
const extOf = (file) => file.slice(file.lastIndexOf('.') + 1).toLowerCase()
const kindOf = (file) => (extOf(file) === 'dmn' ? 'dmn' : 'bpmn')

export function diagramsDir() {
  return process.env.DIAGRAMS_DIR || fileURLToPath(new URL('./data/diagrams', import.meta.url))
}

export class DiagramStore {
  #queue = Promise.resolve()

  constructor(dir = diagramsDir()) {
    this.dir = dir
    this.ready = mkdir(dir, { recursive: true, mode: DIR_MODE }).then(() => this.#migrate())
    // L'erreur (dossier sans droit d'écriture, par exemple) ressort à la première requête.
    this.ready.catch(() => {})
  }

  static validId(id) {
    return typeof id === 'string' && ID.test(id)
  }

  static cleanName(name) {
    if (typeof name !== 'string') return null
    const clean = name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME)
    return clean || null
  }

  // Liste les diagrammes. Un fichier .bpmn déposé à la main dans le dossier y entre, au nom de
  // son fichier. Un fichier supprimé à la main en sort. Taille et date viennent du fichier, pour
  // suivre aussi les modifications faites hors de l'éditeur.
  list() {
    return this.#locked(async () => {
      await this.ready
      const index = await this.#readIndex()
      const known = new Set(Object.values(index).map((item) => item.file))
      let adopted = false
      for (const file of await readdir(this.dir)) {
        if (known.has(file) || !file.includes('.') || !KINDS[extOf(file)] || !(await this.#isFile(file))) continue
        const name = DiagramStore.cleanName(file.slice(0, file.lastIndexOf('.')))
        if (!name) continue
        index[randomUUID()] = { file, name }
        adopted = true
      }
      if (adopted) await this.#writeIndex(index)
      const items = []
      for (const [id, item] of Object.entries(index)) {
        const info = await this.#fileInfo(item.file)
        if (info) items.push({ id, name: item.name, kind: kindOf(item.file), updatedAt: info.mtime.toISOString(), size: info.size })
      }
      return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })
  }

  async get(id) {
    await this.ready
    const item = (await this.#readIndex())[id]
    const info = item && (await this.#fileInfo(item.file))
    // Un fichier trop gros (déposé à la main) n'est pas envoyé à l'éditeur.
    if (!info || info.size > MAX_XML_BYTES) return null
    const xml = await readFile(join(this.dir, item.file), 'utf8')
    return { id, name: item.name, kind: kindOf(item.file), updatedAt: info.mtime.toISOString(), size: info.size, file: item.file, xml }
  }

  // kind : 'bpmn' (par défaut) ou 'dmn'. Un enregistrement garde le genre qu'il a déjà.
  put(id, name, xml, kind = 'bpmn') {
    return this.#locked(async () => {
      await this.ready
      const index = await this.#readIndex()
      const old = index[id]
      let file
      if (old && (await this.#isFile(old.file))) {
        file = name === old.name ? old.file : await this.#moveTo(old.file, name)
        await this.#writeAtomic(file, xml)
      } else {
        file = await createUnique(this.dir, safeBaseName(name), KINDS[kind] || EXT, xml)
      }
      index[id] = { file, name, updatedAt: new Date().toISOString(), size: Buffer.byteLength(xml) }
      await this.#writeIndex(index)
      return { id, ...index[id], kind: kindOf(file) }
    })
  }

  rename(id, name) {
    return this.#locked(async () => {
      await this.ready
      const index = await this.#readIndex()
      const item = index[id]
      if (!item || !(await this.#isFile(item.file))) return null
      item.file = await this.#moveTo(item.file, name)
      item.name = name
      item.updatedAt = new Date().toISOString()
      await this.#writeIndex(index)
      return { id, ...item, kind: kindOf(item.file) }
    })
  }

  remove(id) {
    return this.#locked(async () => {
      await this.ready
      const index = await this.#readIndex()
      const item = index[id]
      if (!item) return
      await rm(join(this.dir, item.file), { force: true })
      delete index[id]
      await this.#writeIndex(index)
    })
  }

  // Une opération d'écriture à la fois : deux enregistrements simultanés ne peuvent pas
  // prendre le même nom de fichier ni perdre une ligne de l'index.
  #locked(fn) {
    const run = this.#queue.then(fn, fn)
    this.#queue = run.catch(() => {})
    return run
  }

  // Donne au fichier le nom tiré de « name », sans écraser un autre fichier. Le nouveau nom est
  // d'abord réservé par un fichier vide (création exclusive), que le renommage remplace.
  // Un fichier qui porte déjà ce nom, avec ou sans « (2) », le garde.
  async #moveTo(file, name) {
    const base = safeBaseName(name)
    const ext = extOf(file)
    if (file === `${base}.${ext}` || (file.startsWith(`${base} (`) && /^ \(\d+\)$/.test(file.slice(base.length, -ext.length - 1)))) return file
    const reserved = await createUnique(this.dir, base, ext, '', { exclude: file })
    await rename(join(this.dir, file), join(this.dir, reserved))
    return reserved
  }

  async #isFile(file) {
    return !!(await this.#fileInfo(file))
  }

  // Fichier ordinaire du dossier, ou null. lstat : un lien symbolique déposé dans le dossier
  // n'est pas suivi.
  async #fileInfo(file) {
    if (typeof file !== 'string' || file.includes('/') || file.includes('\\') || file.startsWith('.')) return null
    try {
      const info = await lstat(join(this.dir, file))
      return info.isFile() ? info : null
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  async #readIndex() {
    try {
      const data = JSON.parse(await readFile(join(this.dir, INDEX), 'utf8'))
      const index = {}
      for (const [id, item] of Object.entries(data?.diagrams ?? {})) {
        if (DiagramStore.validId(id) && item && typeof item.file === 'string' && typeof item.name === 'string') index[id] = item
      }
      return index
    } catch (err) {
      if (err.code === 'ENOENT') return {}
      throw err
    }
  }

  async #writeIndex(index) {
    await this.#writeAtomic(INDEX, JSON.stringify({ version: 1, diagrams: index }, null, 2))
  }

  // Écriture dans un fichier temporaire puis renommage : un arrêt en cours d'écriture ne
  // laisse pas de fichier à moitié écrit.
  async #writeAtomic(file, content) {
    const tmp = join(this.dir, `.${file}.${process.pid}.tmp`)
    await writeFile(tmp, content, { encoding: 'utf8', mode: FILE_MODE })
    await rename(tmp, join(this.dir, file))
  }

  // Anciennes versions : « <id>.bpmn » et « <id>.json » pour chaque diagramme. Les fichiers
  // prennent le nom de leur diagramme et rejoignent l'index.
  async #migrate() {
    const files = await readdir(this.dir)
    const legacy = files.filter((f) => f.endsWith('.json') && f !== INDEX && DiagramStore.validId(f.slice(0, -5)))
    if (!legacy.length) return
    const index = await this.#readIndex()
    for (const json of legacy) {
      const id = json.slice(0, -5)
      let meta
      try {
        meta = JSON.parse(await readFile(join(this.dir, json), 'utf8'))
      } catch {
        continue
      }
      const old = `${id}.${EXT}`
      if (meta?.id !== id || !(await this.#isFile(old)) || index[id]) continue
      const name = DiagramStore.cleanName(meta.name) || id
      const file = await this.#moveTo(old, name)
      index[id] = { file, name, updatedAt: meta.updatedAt, size: meta.size }
      await this.#writeIndex(index)
      await rm(join(this.dir, json), { force: true })
    }
  }
}
