import { createHash } from 'node:crypto'
import { defineConfig, loadEnv } from 'vite'

// Politique de sécurité du contenu de la version en ligne : seuls les scripts du
// site s'exécutent (le petit script du thème est autorisé par son empreinte).
// Les connexions restent ouvertes en https, et vers localhost pour Ollama, car
// l'adresse du fournisseur est libre. La clé du visiteur est protégée par
// l'absence de script tiers.
function onlineCsp() {
  return {
    name: 'online-csp',
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
          "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
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

// Adresse mail du lien « Feedback » (FEEDBACK_EMAIL, dans .env ou l'environnement) :
// rangée encodée dans le code, et non en clair, pour gêner les robots qui
// ramassent les adresses. La page la décode au clic.
function encodedEmail(mode) {
  const email = (loadEnv(mode, process.cwd(), '').FEEDBACK_EMAIL || '').trim()
  return email ? Buffer.from([...email].reverse().join(''), 'utf8').toString('base64') : ''
}

export default defineConfig(({ mode }) => ({
  plugins: mode === 'online' ? [onlineCsp()] : [],
  define: { __FEEDBACK_EMAIL__: JSON.stringify(encodedEmail(mode)) },
  build: {
    outDir: mode === 'online' ? 'dist-online' : 'dist',
    assetsDir: 'assets',
    rollupOptions: {
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
