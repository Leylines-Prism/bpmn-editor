// Mode sans navigateur (MCP_HEADLESS=on) : quand un agent appelle un outil et qu'aucun onglet de
// l'éditeur n'est ouvert, le serveur ouvre l'éditeur dans un onglet invisible du service
// « renderer » (Chromium sans écran, joint par son interface DevTools sur le réseau interne).
// Cet onglet se relie au pont /bridge comme les autres : les outils s'y exécutent à l'identique,
// images et PDF compris. Il se ferme après un temps sans appel.
//
// Seule l'interface HTTP de DevTools sert (/json/version, /json/new, /json/close) : aucune
// bibliothèque de pilotage de navigateur n'est embarquée.

import { randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const ON = /^(on|true|1|yes)$/i

// Réglages tirés de l'environnement. enabled : MCP_HEADLESS=on. Coupé par défaut.
export function headlessConfig(env = process.env) {
  const enabled = ON.test((env.MCP_HEADLESS || '').trim())
  const cdpUrl = (env.HEADLESS_BROWSER_URL || 'http://renderer:9222').trim().replace(/\/+$/, '')
  const editorUrl = (env.HEADLESS_EDITOR_URL || 'http://editor:8080').trim().replace(/\/+$/, '')
  const idle = Number(env.HEADLESS_IDLE_SECONDS)
  return {
    enabled,
    cdpUrl,
    editorUrl,
    idleMs: (Number.isFinite(idle) && idle >= 10 ? idle : 300) * 1000,
    // Origine de la page invisible, à accepter sur /bridge et /diagrams.
    editorOrigin: enabled ? safeOrigin(editorUrl) : null,
  }
}

function safeOrigin(url) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

// DevTools refuse un en-tête Host qui n'est ni une adresse IP ni localhost (protection contre le
// DNS rebinding) : le nom du service est donc remplacé par son adresse avant chaque requête.
async function devtoolsBase(cdpUrl) {
  const url = new URL(cdpUrl)
  if (!isIP(url.hostname) && url.hostname !== 'localhost') {
    const { address, family } = await lookup(url.hostname)
    url.hostname = family === 6 ? `[${address}]` : address
  }
  return url.origin
}

export class HeadlessRenderer {
  constructor({ cdpUrl, editorUrl, idleMs = 300_000, log = console.error, fetchImpl = fetch }) {
    this.cdpUrl = cdpUrl
    this.editorUrl = editorUrl
    this.idleMs = idleMs
    this.log = log
    this.fetch = fetchImpl
    this.target = null // { id, key } de l'onglet invisible ouvert
    this.idleTimer = null
    this.onIdle = null // appelé avant la fermeture pour inactivité
  }

  // Ouvre un onglet invisible sur l'éditeur. Renvoie la clé que l'onglet présentera au pont
  // (paramètre headless de son adresse), pour qu'on le reconnaisse parmi les onglets.
  async open() {
    const key = randomBytes(16).toString('hex')
    const page = `${this.editorUrl}/?headless=${key}`
    const base = await devtoolsBase(this.cdpUrl)
    const res = await this.fetch(`${base}/json/new?${encodeURI(page)}`, { method: 'PUT', signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`the headless browser refused to open a page (HTTP ${res.status})`)
    const info = await res.json()
    this.target = { id: info.id, key }
    this.log(`[headless] onglet invisible ouvert (${info.id.slice(0, 8)})`)
    this.touch()
    return key
  }

  // Un appel vient de passer par l'onglet invisible : le délai d'inactivité repart.
  touch() {
    clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.#closeForIdle(), this.idleMs)
    this.idleTimer.unref?.()
  }

  async #closeForIdle() {
    try {
      await this.onIdle?.()
    } catch (err) {
      this.log(`[headless] enregistrement avant fermeture impossible : ${err.message}`)
    }
    await this.close()
  }

  async close() {
    clearTimeout(this.idleTimer)
    const target = this.target
    this.target = null
    if (!target) return
    try {
      const base = await devtoolsBase(this.cdpUrl)
      await this.fetch(`${base}/json/close/${encodeURIComponent(target.id)}`, { signal: AbortSignal.timeout(5_000) })
      this.log(`[headless] onglet invisible fermé (${target.id.slice(0, 8)})`)
    } catch (err) {
      this.log(`[headless] fermeture de l'onglet invisible impossible : ${err.message}`)
    }
  }

  // Le navigateur répond-il ? Pour /healthz et le message d'erreur.
  async reachable() {
    try {
      const base = await devtoolsBase(this.cdpUrl)
      const res = await this.fetch(`${base}/json/version`, { signal: AbortSignal.timeout(3_000) })
      return res.ok
    } catch {
      return false
    }
  }
}
