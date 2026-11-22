import { createHash } from 'node:crypto'
import { defineConfig } from 'vite'

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

export default defineConfig(({ mode }) => ({
  plugins: mode === 'online' ? [onlineCsp()] : [],
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
