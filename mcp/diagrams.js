// Diagrammes enregistrés sur le serveur (« Mes diagrammes », version docker).
// Chaque diagramme est un fichier <id>.bpmn, accompagné de <id>.json pour son
// nom et sa date. Le dossier est un volume docker, ou mcp/data/diagrams en
// développement.

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_XML_BYTES = 10 * 1024 * 1024
const MAX_NAME = 120
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export function diagramsDir() {
  return process.env.DIAGRAMS_DIR || fileURLToPath(new URL('./data/diagrams', import.meta.url))
}

export class DiagramStore {
  constructor(dir = diagramsDir()) {
    this.dir = dir
    this.ready = mkdir(dir, { recursive: true })
  }

  static validId(id) {
    return typeof id === 'string' && ID.test(id)
  }

  static cleanName(name) {
    if (typeof name !== 'string') return null
    const clean = name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME)
    return clean || null
  }

  async list() {
    await this.ready
    const files = (await readdir(this.dir)).filter((f) => f.endsWith('.json'))
    const items = []
    for (const file of files) {
      try {
        const meta = JSON.parse(await readFile(join(this.dir, file), 'utf8'))
        if (DiagramStore.validId(meta.id)) items.push({ id: meta.id, name: meta.name, updatedAt: meta.updatedAt, size: meta.size })
      } catch {}
    }
    return items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  }

  async get(id) {
    await this.ready
    try {
      const meta = JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8'))
      const xml = await readFile(join(this.dir, `${id}.bpmn`), 'utf8')
      return { ...meta, xml }
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  async put(id, name, xml) {
    await this.ready
    const meta = { id, name, updatedAt: new Date().toISOString(), size: Buffer.byteLength(xml) }
    // Écriture dans un fichier temporaire puis renommage : un arrêt en cours
    // d'écriture ne laisse pas de fichier à moitié écrit.
    await this.#write(`${id}.bpmn`, xml)
    await this.#write(`${id}.json`, JSON.stringify(meta, null, 2))
    return meta
  }

  async rename(id, name) {
    await this.ready
    let meta
    try {
      meta = JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8'))
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
    meta.name = name
    meta.updatedAt = new Date().toISOString()
    await this.#write(`${id}.json`, JSON.stringify(meta, null, 2))
    return meta
  }

  async remove(id) {
    await this.ready
    await rm(join(this.dir, `${id}.json`), { force: true })
    await rm(join(this.dir, `${id}.bpmn`), { force: true })
  }

  async #write(file, content) {
    const tmp = join(this.dir, `.${file}.${process.pid}.tmp`)
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, join(this.dir, file))
  }
}
