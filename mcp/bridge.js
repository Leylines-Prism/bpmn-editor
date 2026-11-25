// Pont WebSocket entre le serveur MCP et les onglets de l'éditeur.
//
// Chaque onglet ouvert se connecte sur /bridge. Les appels d'outils sont
// relayés à l'onglet actif le plus récemment, qui les exécute sur son
// bpmn-js et renvoie le résultat.

import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'

const CALL_TIMEOUT_MS = 20000

export class EditorBridge {
  constructor({ allowedOrigins, log = console.error }) {
    this.allowedOrigins = new Set(allowedOrigins)
    this.log = log
    this.clients = new Map() // ws -> { id, title, lastActive }
    this.pending = new Map() // callId -> { resolve, reject, timer }
    this.mcpClient = null // { name, version, lastCall } du dernier client MCP connecté
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 })
    this.wss.on('connection', (ws) => this.#onConnection(ws))
  }

  // À brancher sur l'événement 'upgrade' du serveur HTTP.
  handleUpgrade(req, socket, head) {
    const { pathname } = new URL(req.url, 'http://localhost')
    if (pathname !== '/bridge') {
      socket.destroy()
      return
    }
    // Seules les pages de l'éditeur ont le droit de se connecter.
    const origin = req.headers.origin
    if (!origin || !this.allowedOrigins.has(origin)) {
      this.log(`[bridge] connexion refusée, origine non autorisée : ${origin ?? '(aucune)'}`)
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req))
  }

  #onConnection(ws) {
    const client = { id: randomUUID().slice(0, 8), title: '', lastActive: Date.now() }
    this.clients.set(ws, client)
    // L'onglet apprend son identifiant, que le chat intégré joint à ses messages
    // pour que l'IA dessine dans l'onglet où l'on discute.
    ws.send(JSON.stringify({ type: 'welcome', id: client.id }))
    if (this.mcpClient) ws.send(JSON.stringify({ type: 'mcp-client', ...this.mcpClient }))
    this.log(`[bridge] onglet ${client.id} connecté (${this.clients.size} au total)`)

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.type === 'hello' || msg.type === 'active') {
        client.lastActive = Date.now()
        if (typeof msg.title === 'string') client.title = msg.title
      } else if (msg.type === 'result' && this.pending.get(msg.id)?.ws === ws) {
        // Seul l'onglet qui a reçu l'appel peut y répondre.
        const { resolve, reject, timer } = this.pending.get(msg.id)
        clearTimeout(timer)
        this.pending.delete(msg.id)
        if (msg.ok) resolve(msg.data)
        else reject(new Error(msg.error || 'Unknown error in the editor'))
      }
    })

    ws.on('close', () => {
      this.clients.delete(ws)
      for (const [id, call] of this.pending) {
        if (call.ws !== ws) continue
        clearTimeout(call.timer)
        this.pending.delete(id)
        call.reject(new Error('The editor tab was closed during the call.'))
      }
      this.log(`[bridge] onglet ${client.id} déconnecté (${this.clients.size} restant)`)
    })
  }

  #activeSocket() {
    let best = null
    for (const [ws, client] of this.clients) {
      if (ws.readyState !== ws.OPEN) continue
      if (!best || client.lastActive > best.client.lastActive) best = { ws, client }
    }
    return best
  }

  #socketById(id) {
    for (const [ws, client] of this.clients) {
      if (client.id === id && ws.readyState === ws.OPEN) return { ws, client }
    }
    return null
  }

  // Nom et version annoncés par le client MCP à sa connexion (clientInfo du
  // protocole). Le protocole ne transmet ni le modèle ni l'utilisateur.
  noteMcpClient(info) {
    const clean = (value) => (typeof value === 'string' ? value.replace(/[^\w .@()+/-]/g, '').trim().slice(0, 60) : '')
    const name = clean(info?.name)
    if (!name) return
    this.mcpClient = { name, version: clean(info?.version), lastCall: this.mcpClient?.name === name ? this.mcpClient.lastCall : null }
    this.log(`[mcp] client connecté : ${name} ${this.mcpClient.version}`)
    this.#broadcastMcpClient()
  }

  // Un outil vient d'être appelé par un client MCP (pas par le chat intégré).
  noteMcpCall() {
    if (!this.mcpClient) this.mcpClient = { name: '', version: '', lastCall: null }
    this.mcpClient.lastCall = Date.now()
    this.#broadcastMcpClient()
  }

  #broadcastMcpClient() {
    const msg = JSON.stringify({ type: 'mcp-client', ...this.mcpClient })
    for (const ws of this.clients.keys()) if (ws.readyState === ws.OPEN) ws.send(msg)
  }

  hasTab(id) {
    return !!this.#socketById(id)
  }

  status() {
    const active = this.#activeSocket()
    return { tabs: this.clients.size, activeTab: active?.client.id ?? null }
  }

  // Exécute un outil dans un onglet et renvoie son résultat : l'onglet
  // indiqué par tabId (chat intégré), sinon l'onglet actif (clients MCP).
  call(tool, args, { tabId } = {}) {
    const target = tabId ? this.#socketById(tabId) : this.#activeSocket()
    if (!target) {
      return Promise.reject(
        new Error(
          tabId
            ? 'The editor tab is no longer connected to the server.'
            : 'No BPMN editor connected. Open the editor in the browser, then try again.',
        ),
      )
    }
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`The editor did not answer within ${CALL_TIMEOUT_MS / 1000} s.`))
      }, CALL_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer, ws: target.ws })
      target.ws.send(JSON.stringify({ type: 'call', id, tool, args }))
    })
  }
}
