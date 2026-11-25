// Serveur MCP de l'éditeur BPMN.
//
//   POST /mcp     point d'entrée MCP (Streamable HTTP, sans session)
//   WS   /bridge  connexion des onglets de l'éditeur
//   POST /chat    chat intégré à l'éditeur (réponse en flux SSE)
//   GET  /healthz état du serveur et nombre d'onglets connectés
//
// N'écoute que sur 127.0.0.1 : rien n'est exposé sur le réseau. Dans le conteneur docker,
// MCP_HOST=0.0.0.0 le rend joignable par nginx, et MCP_ALLOWED_HOSTS limite les noms
// d'hôte acceptés (protection contre le DNS rebinding).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import Anthropic from '@anthropic-ai/sdk'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import * as z from 'zod/v4'

import express from 'express'
import { timingSafeEqual } from 'node:crypto'

import { EditorBridge } from './bridge.js'
import { DiagramStore, MAX_XML_BYTES } from './diagrams.js'
import { ExportStore, MAX_EXPORT_BYTES } from './exports.js'
import { ChatService } from './chat.js'
import { isForbiddenAddress, relayFetch } from './relay-guard.js'
import { OpenAICompatError } from '../src/ai/openai-compat.js'
import { INSTRUCTIONS, buildTools } from '../src/ai/tools.js'
import { describeProviderError } from '../src/ai/errors.js'
import { checkAttachments } from '../src/ai/attachments.js'
import { imageCaption, isImageResult } from '../src/ai/image-result.js'
import { PROVIDERS, checkBaseUrl, listModels } from '../src/ai/providers.js'

// Variables d'environnement facultatives dans mcp/.env (exclu de git).
try {
  process.loadEnvFile(new URL('.env', import.meta.url))
} catch {}

const HOST = process.env.MCP_HOST || '127.0.0.1'
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1']
const ALLOWED_HOSTS = (process.env.MCP_ALLOWED_HOSTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const PORT = Number(process.env.MCP_PORT || 3333)
// Jeton facultatif demandé aux clients MCP (en-tête Authorization: Bearer …).
const MCP_TOKEN = (process.env.MCP_TOKEN || '').trim()
// Relais des fournisseurs réglés dans la fenêtre Options. CHAT_RELAY=off le coupe : seuls
// les modèles configurés sur le serveur restent proposés.
const RELAY = !/^(off|false|0|no)$/i.test((process.env.CHAT_RELAY || '').trim())
const ALLOWED_ORIGINS = (process.env.BPMN_EDITOR_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Fichiers créés en 0640 et dossiers en 0750 : lisibles par le propriétaire et son groupe seulement.
process.umask(0o027)

const log = (...args) => console.error(new Date().toLocaleTimeString('fr-FR'), ...args)
const bridge = new EditorBridge({ allowedOrigins: ALLOWED_ORIGINS, log })
const chat = new ChatService({ bridge, log })
const TOOLS = buildTools(z)

function buildMcpServer() {
  const server = new McpServer({ name: 'bpmn-editor', version: '0.1.0' }, { instructions: INSTRUCTIONS })
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      async (args) => {
        try {
          const data = await bridge.call(tool.name, args ?? {})
          if (isImageResult(data)) {
            return {
              content: [
                { type: 'image', data: data.image.data, mimeType: data.image.mediaType },
                { type: 'text', text: imageCaption(data.image) },
              ],
            }
          }
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

// Hors de 127.0.0.1, les noms d'hôte acceptés sont ceux de MCP_ALLOWED_HOSTS, ou localhost par défaut.
const app = createMcpExpressApp(
  LOCAL_HOSTS.includes(HOST) ? { host: HOST } : { host: HOST, allowedHosts: ALLOWED_HOSTS.length ? ALLOWED_HOSTS : ['localhost', '127.0.0.1'] },
)

function checkToken(req, res, next) {
  if (!MCP_TOKEN) return next()
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim())
  const expected = Buffer.from(MCP_TOKEN)
  if (given.length === expected.length && timingSafeEqual(given, expected)) return next()
  res.set('WWW-Authenticate', 'Bearer')
  res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: missing or wrong MCP token' }, id: null })
}

// Les clients MCP n'envoient pas d'en-tête Origin. Une requête qui en porte un vient d'une
// page web : seules les pages de l'éditeur sont acceptées, comme pour /chat et /bridge.
function checkMcpOrigin(req, res, next) {
  const origin = req.headers.origin
  if (origin === undefined || ALLOWED_ORIGINS.includes(origin)) return next()
  res.status(403).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Origin not allowed' }, id: null })
}

app.post('/mcp', checkMcpOrigin, checkToken, async (req, res) => {
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
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
    }
  }
})

const methodNotAllowed = (req, res) =>
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null })
app.get('/mcp', methodNotAllowed)
app.delete('/mcp', methodNotAllowed)

app.get('/healthz', (req, res) => res.json({ ok: true, ...bridge.status(), chat: chat.status() }))

// ── Chat intégré ───────────────────────────────────────────────────────────
// Réservé aux pages de l'éditeur : chaque message consomme des crédits d'API.

const ALLOWED_ORIGIN_SET = new Set(ALLOWED_ORIGINS)

// Langue des messages renvoyés à l'éditeur : celle de son interface (« lang » du corps), anglais par défaut.
const langOf = (req) => (req.body?.lang === 'fr' ? 'fr' : 'en')
const T = (req, en, fr) => (langOf(req) === 'fr' ? fr : en)
function chatCors(req, res, next) {
  const origin = req.headers.origin
  // Image docker : l'éditeur et le serveur partagent une adresse, et le navigateur
  // n'envoie pas d'en-tête Origin pour une lecture (GET) sur le même site.
  if (!origin && req.headers['sec-fetch-site'] === 'same-origin') return next()
  if (!origin || !ALLOWED_ORIGIN_SET.has(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  res.set('Access-Control-Allow-Origin', origin)
  res.set('Vary', 'Origin')
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.set('Access-Control-Max-Age', '600')
    return res.sendStatus(204)
  }
  next()
}
app.options('/chat', chatCors)
app.options('/chat/models', chatCors)
app.get('/chat', chatCors, (req, res) => res.json({ ...chat.status(), relay: RELAY, mcpAuth: Boolean(MCP_TOKEN) }))

// Fournisseur réglé dans la fenêtre Options : { provider, format, baseUrl, apiKey, model? }.
// La clé n'est ni enregistrée ni écrite dans le journal. Renvoie null si invalide.
const PROVIDER_IDS = new Set(PROVIDERS.map((p) => p.id))
function readCustom(value, { needModel }) {
  if (!value || typeof value !== 'object') return null
  const { provider, label, format, baseUrl, apiKey, model } = value
  if (!PROVIDER_IDS.has(provider) || (format !== 'anthropic' && format !== 'openai')) return null
  const url = checkBaseUrl(baseUrl)
  if (!url || isForbiddenAddress(new URL(url).hostname)) return null
  if (apiKey !== undefined && apiKey !== null && (typeof apiKey !== 'string' || apiKey.length > 500)) return null
  if (needModel && (typeof model !== 'string' || !model.trim() || model.length > 200)) return null
  const fallbackLabel = PROVIDERS.find((p) => p.id === provider).label
  return {
    provider,
    label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 60) : fallbackLabel,
    format,
    baseUrl: url,
    apiKey: apiKey || null,
    model: needModel ? model.trim() : undefined,
  }
}

const RELAY_OFF = (req) => T(req, 'Providers set in Options are turned off on this server (CHAT_RELAY=off).', 'Les fournisseurs réglés dans Options sont désactivés sur ce serveur (CHAT_RELAY=off).')

// Erreur d'un fournisseur relayé, telle qu'elle repart vers le navigateur. Le relais
// appelle une adresse choisie par la page : le corps d'une réponse qui n'est pas une
// erreur d'API en JSON (page HTML, service interne…) n'est jamais renvoyé, seul son statut.
function relayError(err) {
  if (!err || typeof err !== 'object' || typeof err.status !== 'number') return err
  const parsed = err.providerJson ?? err.error
  return parsed ? err : { name: err.name, status: err.status, message: '' }
}

// Bouton « Tester » ou « Lister » de la fenêtre Options, relayé par le serveur.
app.post('/chat/models', chatCors, async (req, res) => {
  if (!RELAY) return res.json({ error: RELAY_OFF(req) })
  const custom = readCustom(req.body, { needModel: false })
  if (!custom) return res.status(400).json({ error: T(req, 'Invalid settings', 'Réglages invalides') })
  try {
    const models = await listModels({ ...custom, signal: AbortSignal.timeout(15000), fetch: relayFetch })
    res.json({ models })
  } catch (err) {
    res.json({ error: describeProviderError(relayError(err), { label: custom.label, providerId: custom.provider, lang: langOf(req) }) })
  }
})

// Les messages avec pièces jointes (images, PDF) dépassent la limite de 100 Ko du
// lecteur JSON général : ils arrivent avec leur propre type, lu ici jusqu'à 34 Mo.
const chatBody = express.json({ type: 'application/vnd.bpmn-chat+json', limit: '34mb' })

app.post('/chat', chatCors, chatBody, async (req, res) => {
  const { conversationId, tabId, text, model } = req.body ?? {}
  const attachments = checkAttachments(req.body?.attachments)
  if (!attachments) return res.status(400).json({ error: T(req, 'Invalid attachments (type or size)', 'Pièces jointes invalides (type ou taille)') })
  if (typeof text !== 'string' || !text.trim() || text.length > 100000 || typeof tabId !== 'string') {
    return res.status(400).json({ error: T(req, 'Invalid request', 'Requête invalide') })
  }
  if (req.body.custom !== undefined && !RELAY) return res.status(400).json({ error: RELAY_OFF(req) })
  const custom = req.body.custom === undefined ? null : readCustom(req.body.custom, { needModel: true })
  if (req.body.custom !== undefined && !custom) return res.status(400).json({ error: T(req, 'Invalid provider settings', 'Réglages du fournisseur invalides') })
  // Sinon, seuls les modèles configurés sur le serveur sont acceptés.
  if (!custom && model !== undefined && (typeof model !== 'string' || !chat.hasModel(model))) {
    return res.status(400).json({ error: T(req, 'Unknown model', 'Modèle inconnu') })
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
      custom,
      text: text.trim(),
      attachments,
      emit,
      signal: abort.signal,
      lang: langOf(req),
    })
    emit({ type: 'done' })
  } catch (err) {
    if (!abort.signal.aborted) {
      log('[chat] erreur :', err.message)
      emit({ type: 'error', message: custom ? describeProviderError(relayError(err), { label: custom.label, providerId: custom.provider, lang: langOf(req) }) : chatErrorMessage(err, langOf(req)) })
    }
  }
  res.end()
})

// ── Mes diagrammes, enregistrés sur le serveur ─────────────────────────────
// Mêmes règles d'origine que le chat : seules les pages de l'éditeur y ont accès.

const diagrams = new DiagramStore()
const xmlBody = express.text({ type: ['application/xml', 'text/xml', 'text/plain'], limit: MAX_XML_BYTES })
function checkId(req, res, next) {
  if (!DiagramStore.validId(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
  next()
}
const failed = (res, err) => {
  log('[diagrams] erreur :', err.message)
  res.status(500).json({ error: 'Storage error' })
}

app.options('/diagrams', chatCors)
app.options('/diagrams/:id', chatCors)
app.get('/diagrams', chatCors, async (req, res) => {
  try { res.json({ diagrams: await diagrams.list() }) } catch (err) { failed(res, err) }
})
app.get('/diagrams/:id', chatCors, checkId, async (req, res) => {
  try {
    const item = await diagrams.get(req.params.id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json(item)
  } catch (err) { failed(res, err) }
})
app.put('/diagrams/:id', chatCors, checkId, xmlBody, async (req, res) => {
  const name = DiagramStore.cleanName(req.query.name)
  if (!name || typeof req.body !== 'string' || !req.body.includes('<')) return res.status(400).json({ error: 'Invalid diagram' })
  try { res.json(await diagrams.put(req.params.id, name, req.body)) } catch (err) { failed(res, err) }
})
app.patch('/diagrams/:id', chatCors, checkId, async (req, res) => {
  const name = DiagramStore.cleanName(req.body?.name)
  if (!name) return res.status(400).json({ error: 'Invalid name' })
  try {
    const meta = await diagrams.rename(req.params.id, name)
    if (!meta) return res.status(404).json({ error: 'Not found' })
    res.json(meta)
  } catch (err) { failed(res, err) }
})
app.delete('/diagrams/:id', chatCors, checkId, async (req, res) => {
  try {
    await diagrams.remove(req.params.id)
    res.json({ ok: true })
  } catch (err) { failed(res, err) }
})

// ── Exports enregistrés sur le serveur ─────────────────────────────────────
// Le menu Exporter, réglé sur « Serveur » ou « Les deux », envoie ici le fichier produit.
// POST /exports?format=pdf&name=Mon%20processus → { file: "Mon processus.pdf" }

const exportsStore = new ExportStore()
const exportBody = express.raw({ type: 'application/octet-stream', limit: MAX_EXPORT_BYTES })
app.options('/exports', chatCors)
app.post('/exports', chatCors, exportBody, async (req, res) => {
  const format = req.query.format
  const name = DiagramStore.cleanName(req.query.name)
  if (!name || !ExportStore.validFormat(format)) return res.status(400).json({ error: T(req, 'Invalid name or format', 'Nom ou format invalide') })
  if (!ExportStore.validContent(format, req.body)) return res.status(400).json({ error: T(req, 'The file does not match its format', 'Le fichier ne correspond pas à son format') })
  try {
    res.json({ file: await exportsStore.save(name, format, req.body) })
  } catch (err) {
    log('[exports] erreur :', err.message)
    res.status(500).json({ error: T(req, 'The server could not save the file', "Le serveur n'a pas pu enregistrer le fichier") })
  }
})

// Dossier monté sans droit d'écriture pour le serveur : le dire au démarrage, avec la solution.
for (const store of [diagrams, exportsStore]) {
  store.ready.catch((err) => {
    log(`[fichiers] ${store.dir} inaccessible (${err.code || err.message}).`)
    if (err.code === 'EACCES') log('Le dossier monté doit appartenir à l\'utilisateur du conteneur : réglez PUID et PGID (voir le README).')
  })
}

function chatErrorMessage(err, lang = 'en') {
  const T = (en, fr) => (lang === 'fr' ? fr : en)
  if (err instanceof Anthropic.AuthenticationError) return T('API key rejected. Check ANTHROPIC_API_KEY on the server.', "Clé API refusée. Vérifiez ANTHROPIC_API_KEY sur le serveur.")
  if (err instanceof Anthropic.PermissionDeniedError) return T('This API key has no access to this model.', "Cette clé API n'a pas accès à ce modèle.")
  if (err instanceof Anthropic.RateLimitError) return T('API usage limit reached, or credits used up. Try again later.', "Limite d'utilisation de l'API atteinte, ou crédits épuisés. Réessayez plus tard.")
  if (err instanceof Anthropic.BadRequestError) return T(`Request rejected by the API: ${err.message}`, `Requête refusée par l'API : ${err.message}`)
  if (err instanceof Anthropic.APIError) return T(`API error (${err.status ?? 'network'}): ${err.message}`, `Erreur de l'API (${err.status ?? 'réseau'}) : ${err.message}`)
  if (err instanceof OpenAICompatError && err.provider === 'mistral') {
    if (err.status === 401 || err.status === 403) return T('API key rejected by Mistral. Check MISTRAL_API_KEY on the server.', 'Clé API refusée par Mistral. Vérifiez MISTRAL_API_KEY sur le serveur.')
    if (err.status === 404) return T(`Model or address not found at Mistral. Check MISTRAL_BASE_URL and MISTRAL_MODELS (${err.message}).`, `Modèle ou adresse introuvable chez Mistral. Vérifiez MISTRAL_BASE_URL et MISTRAL_MODELS (${err.message}).`)
    if (err.status === 429) return T('Mistral usage limit reached, or credits used up. Try again later.', "Limite d'utilisation de Mistral atteinte, ou crédits épuisés. Réessayez plus tard.")
    if (err.status === null) return T(`Mistral unreachable. Check MISTRAL_BASE_URL (${err.message}).`, `Mistral injoignable. Vérifiez MISTRAL_BASE_URL (${err.message}).`)
    return T(`Mistral error (${err.status}): ${err.message}`, `Erreur de Mistral (${err.status}) : ${err.message}`)
  }
  if (err instanceof OpenAICompatError) {
    if (err.status === 401 || err.status === 403) return T('API key rejected by the OpenAI-compatible provider. Check OPENAI_API_KEY on the server.', 'Clé API refusée par le fournisseur compatible OpenAI. Vérifiez OPENAI_API_KEY sur le serveur.')
    if (err.status === 404) return T(`Model or address not found at the OpenAI-compatible provider. Check OPENAI_BASE_URL and OPENAI_MODELS (${err.message}).`, `Modèle ou adresse introuvable chez le fournisseur compatible OpenAI. Vérifiez OPENAI_BASE_URL et OPENAI_MODELS (${err.message}).`)
    if (err.status === 429) return T('Provider usage limit reached, or credits used up. Try again later.', "Limite d'utilisation du fournisseur atteinte, ou crédits épuisés. Réessayez plus tard.")
    if (err.status === null) return T(`OpenAI-compatible provider unreachable. Check OPENAI_BASE_URL (${err.message}).`, `Fournisseur compatible OpenAI injoignable. Vérifiez OPENAI_BASE_URL (${err.message}).`)
    return T(`OpenAI-compatible provider error (${err.status}): ${err.message}`, `Erreur du fournisseur compatible OpenAI (${err.status}) : ${err.message}`)
  }
  return err.message
}

const httpServer = app.listen(PORT, HOST, (err) => {
  if (err) {
    log('Démarrage impossible :', err.message)
    process.exit(1)
  }
  log(`Serveur MCP BPMN prêt sur http://${HOST}:${PORT}/mcp`)
  if (MCP_TOKEN) log('Les clients MCP doivent fournir le jeton MCP_TOKEN.')
  const publicHosts = LOCAL_HOSTS.includes(HOST) ? [] : ALLOWED_HOSTS.filter((h) => !LOCAL_HOSTS.includes(h))
  if (publicHosts.length && !MCP_TOKEN) {
    log(`ATTENTION : le serveur accepte le nom ${publicHosts.join(', ')} mais MCP_TOKEN est vide.`)
    log('Quiconque atteint cette adresse peut piloter l\'éditeur, utiliser les clés d\'API du serveur et lire les diagrammes.')
    log('Réglez MCP_TOKEN, et placez le site derrière une authentification (voir le README).')
  }
  if (!RELAY) log('Relais des fournisseurs de la fenêtre Options désactivé (CHAT_RELAY=off).')
  log(`Origines de l'éditeur autorisées : ${ALLOWED_ORIGINS.join(', ')}`)
  for (const warning of chat.warnings) log(`Attention : ${warning}`)
  log(
    chat.enabled
      ? `Chat intégré actif : ${chat.models.map((m) => m.key).join(', ')} (par défaut ${chat.defaultKey})`
      : 'Chat intégré inactif : ni MISTRAL_API_KEY, ni ANTHROPIC_API_KEY, ni OPENAI_MODELS ne sont définies',
  )
})
httpServer.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head))
