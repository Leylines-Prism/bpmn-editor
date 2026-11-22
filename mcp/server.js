// Serveur MCP de l'éditeur BPMN.
//
//   POST /mcp     point d'entrée MCP (Streamable HTTP, sans session)
//   WS   /bridge  connexion des onglets de l'éditeur
//   GET  /healthz état du serveur et nombre d'onglets connectés
//
// N'écoute que sur 127.0.0.1 : rien n'est exposé sur le réseau.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'

import { EditorBridge } from './bridge.js'
import { INSTRUCTIONS, TOOLS } from './tools.js'

const HOST = '127.0.0.1'
const PORT = Number(process.env.MCP_PORT || 3333)
const ALLOWED_ORIGINS = (process.env.BPMN_EDITOR_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const log = (...args) => console.error(new Date().toLocaleTimeString('fr-FR'), ...args)
const bridge = new EditorBridge({ allowedOrigins: ALLOWED_ORIGINS, log })

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

app.get('/healthz', (req, res) => res.json({ ok: true, ...bridge.status() }))

const httpServer = app.listen(PORT, HOST, (err) => {
  if (err) {
    log('Démarrage impossible :', err.message)
    process.exit(1)
  }
  log(`Serveur MCP BPMN prêt sur http://${HOST}:${PORT}/mcp`)
  log(`Origines de l'éditeur autorisées : ${ALLOWED_ORIGINS.join(', ')}`)
})
httpServer.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head))
