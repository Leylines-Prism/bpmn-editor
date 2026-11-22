// Serveur MCP de l'éditeur BPMN.
//
//   POST /mcp     point d'entrée MCP (Streamable HTTP, sans session)
//   WS   /bridge  connexion des onglets de l'éditeur
//   POST /chat    chat intégré à l'éditeur (réponse en flux SSE)
//   GET  /healthz état du serveur et nombre d'onglets connectés
//
// N'écoute que sur 127.0.0.1 : rien n'est exposé sur le réseau.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import Anthropic from '@anthropic-ai/sdk'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'

import { EditorBridge } from './bridge.js'
import { ChatService } from './chat.js'
import { OpenAICompatError } from './openai-compat.js'
import { INSTRUCTIONS, TOOLS } from './tools.js'

// Variables d'environnement facultatives dans mcp/.env (exclu de git).
try {
  process.loadEnvFile(new URL('.env', import.meta.url))
} catch {}

const HOST = '127.0.0.1'
const PORT = Number(process.env.MCP_PORT || 3333)
const ALLOWED_ORIGINS = (process.env.BPMN_EDITOR_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const log = (...args) => console.error(new Date().toLocaleTimeString('fr-FR'), ...args)
const bridge = new EditorBridge({ allowedOrigins: ALLOWED_ORIGINS, log })
const chat = new ChatService({ bridge, log })

function buildMcpServer() {
  const server = new McpServer({ name: 'bpmn-editor', version: '0.1.0' }, { instructions: INSTRUCTIONS })
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      async (args) => {
        try {
          const data = await bridge.call(tool.name, args ?? {})
          const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
          return { content: [{ type: 'text', text }] }
        } catch (err) {
          log(`[mcp] ${tool.name} : ${err.message}`)
          return { content: [{ type: 'text', text: `Erreur : ${err.message}` }], isError: true }
        }
      },
    )
  }
  return server
}

const app = createMcpExpressApp({ host: HOST })

app.post('/mcp', async (req, res) => {
  const server = buildMcpServer()
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    log('[mcp] erreur de traitement :', err)
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erreur interne' }, id: null })
    }
  }
})

const methodNotAllowed = (req, res) =>
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Méthode non autorisée' }, id: null })
app.get('/mcp', methodNotAllowed)
app.delete('/mcp', methodNotAllowed)

app.get('/healthz', (req, res) => res.json({ ok: true, ...bridge.status(), chat: chat.status() }))

// ── Chat intégré ───────────────────────────────────────────────────────────
// Réservé aux pages de l'éditeur : chaque message consomme des crédits d'API.

const ALLOWED_ORIGIN_SET = new Set(ALLOWED_ORIGINS)
function chatCors(req, res, next) {
  const origin = req.headers.origin
  if (!origin || !ALLOWED_ORIGIN_SET.has(origin)) {
    return res.status(403).json({ error: 'Origine non autorisée' })
  }
  res.set('Access-Control-Allow-Origin', origin)
  res.set('Vary', 'Origin')
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.set('Access-Control-Max-Age', '600')
    return res.sendStatus(204)
  }
  next()
}
app.options('/chat', chatCors)
app.get('/chat', chatCors, (req, res) => res.json(chat.status()))

app.post('/chat', chatCors, async (req, res) => {
  const { conversationId, tabId, text, model } = req.body ?? {}
  if (typeof text !== 'string' || !text.trim() || text.length > 20000 || typeof tabId !== 'string') {
    return res.status(400).json({ error: 'Requête invalide' })
  }
  // Seuls les modèles configurés sur le serveur sont acceptés.
  if (model !== undefined && (typeof model !== 'string' || !chat.hasModel(model))) {
    return res.status(400).json({ error: 'Modèle inconnu' })
  }
  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  const emit = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)

  // Le bouton « Arrêter » de l'éditeur coupe la requête : on interrompt l'appel en cours.
  const abort = new AbortController()
  res.on('close', () => abort.abort())

  try {
    await chat.send({
      conversationId: typeof conversationId === 'string' ? conversationId : undefined,
      tabId,
      model,
      text: text.trim(),
      emit,
      signal: abort.signal,
    })
    emit({ type: 'done' })
  } catch (err) {
    if (!abort.signal.aborted) {
      log('[chat] erreur :', err.message)
      emit({ type: 'error', message: chatErrorMessage(err) })
    }
  }
  res.end()
})

function chatErrorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Clé d'API refusée. Vérifiez ANTHROPIC_API_KEY sur le serveur."
  if (err instanceof Anthropic.PermissionDeniedError) return "Cette clé d'API n'a pas accès à ce modèle."
  if (err instanceof Anthropic.RateLimitError) return "Limite d'utilisation de l'API atteinte, ou crédits épuisés. Réessayez plus tard."
  if (err instanceof Anthropic.BadRequestError) return `Requête refusée par l'API : ${err.message}`
  if (err instanceof Anthropic.APIError) return `Erreur de l'API (${err.status ?? 'réseau'}) : ${err.message}`
  if (err instanceof OpenAICompatError) {
    if (err.status === 401 || err.status === 403) return 'Clé refusée par le fournisseur compatible OpenAI. Vérifiez OPENAI_API_KEY sur le serveur.'
    if (err.status === 404) return `Modèle ou adresse introuvable chez le fournisseur compatible OpenAI. Vérifiez OPENAI_BASE_URL et OPENAI_MODELS (${err.message}).`
    if (err.status === 429) return "Limite d'utilisation du fournisseur atteinte, ou crédits épuisés. Réessayez plus tard."
    if (err.status === null) return `Fournisseur compatible OpenAI injoignable. Vérifiez OPENAI_BASE_URL (${err.message}).`
    return `Erreur du fournisseur compatible OpenAI (${err.status}) : ${err.message}`
  }
  return err.message
}

const httpServer = app.listen(PORT, HOST, (err) => {
  if (err) {
    log('Démarrage impossible :', err.message)
    process.exit(1)
  }
  log(`Serveur MCP BPMN prêt sur http://${HOST}:${PORT}/mcp`)
  log(`Origines de l'éditeur autorisées : ${ALLOWED_ORIGINS.join(', ')}`)
  for (const warning of chat.warnings) log(`Attention : ${warning}`)
  log(
    chat.enabled
      ? `Chat intégré actif : ${chat.models.map((m) => m.key).join(', ')} (par défaut ${chat.defaultKey})`
      : 'Chat intégré inactif : ni ANTHROPIC_API_KEY ni OPENAI_MODELS ne sont définies',
  )
})
httpServer.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head))
