import { createHash } from 'node:crypto'
import { defineConfig, loadEnv } from 'vite'

// Politique de sécurité du contenu, posée au build dans chaque page : seuls les scripts
// du site s'exécutent (le petit script du thème est autorisé par son empreinte).
// connectSrc dit où la page peut se connecter :
//   - version en ligne : en https, et vers localhost pour Ollama, car l'adresse du
//     fournisseur est libre. La clé du visiteur est protégée par l'absence de script tiers.
//   - version serveur (image docker) : le site lui-même seulement, car tout passe par le
//     serveur (pont, chat, diagrammes), plus l'adresse de VITE_MCP_BRIDGE_URL si elle est absolue.
function csp(connectSrc) {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          ([, code]) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`,
        )
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          `connect-src ${connectSrc}`,
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'none'",
        ].join('; ')
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n  <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
      },
    },
  }
}

const ONLINE_CONNECT = "'self' https: http://localhost:* http://127.0.0.1:*"

// Version serveur : le site, plus le serveur MCP s'il est à une autre adresse (ws:// et http://).
function serverConnect(mode) {
  const bridge = (process.env.VITE_MCP_BRIDGE_URL || loadEnv(mode, process.cwd(), 'VITE_').VITE_MCP_BRIDGE_URL || '').trim()
  const sources = ["'self'"]
  try {
    if (bridge && !bridge.startsWith('/')) {
      const url = new URL(bridge)
      const http = url.protocol === 'wss:' ? 'https:' : 'http:'
      sources.push(`${url.protocol}//${url.host}`, `${http}//${url.host}`)
    }
  } catch {}
  return sources.join(' ')
}

// Adresse mail du lien « Feedback » (FEEDBACK_EMAIL, dans .env ou l'environnement) :
// rangée encodée dans le code, et non en clair, pour gêner les robots qui
// ramassent les adresses. La page la décode au clic.
function encodedEmail(mode) {
  const email = (loadEnv(mode, process.cwd(), '').FEEDBACK_EMAIL || '').trim()
  return email ? Buffer.from([...email].reverse().join(''), 'utf8').toString('base64') : ''
}

export default defineConfig(({ mode }) => ({
  // Chemin du site : « / » par défaut, « /bpmn-editor/ » sur GitHub Pages (réglé par le workflow).
  base: process.env.BASE_PATH || '/',
  plugins: [csp(mode === 'online' ? ONLINE_CONNECT : serverConnect(mode))],
  define: { __FEEDBACK_EMAIL__: JSON.stringify(encodedEmail(mode)) },
  build: {
    outDir: mode === 'online' ? 'dist-online' : 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      // Trois pages : l'éditeur, et la page d'aide en anglais et en français.
      input: {
        main: 'index.html',
        help: 'help.html',
        aide: 'aide.html',
      },
      output: {
        manualChunks: {
          bpmn: ['bpmn-js'],
        }
      }
    }
  },
  optimizeDeps: {
    include: ['bpmn-js']
  }
}))
