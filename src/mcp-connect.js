// Fenêtre « Connecter un agent », ouverte d'un clic sur le badge MCP : l'adresse
// du serveur MCP de cette installation, à copier, et des configurations prêtes
// à coller pour Claude Code, Claude Desktop et les autres clients MCP.
//
// L'adresse est calculée depuis celle du pont : en docker, c'est le site
// lui-même (http://localhost:8080/mcp, ou le nom de domaine derrière un proxy),
// en développement le serveur du dossier mcp/ (http://127.0.0.1:3333/mcp).

import { T } from './i18n/lang.js'

const LOCAL = ['localhost', '127.0.0.1', '[::1]', '::1']

// infoUrl : route qui dit si le serveur demande un jeton (GET /chat).
export function setupMcpConnect({ badge, mcpUrl, infoUrl }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'mcp-connect-dialog'
  document.body.appendChild(dialog)

  const code = (id, text) =>
    `<div class="snippet"><pre id="${id}"><code></code></pre><button type="button" class="btn" data-copy="${id}">${T('Copy', 'Copier')}</button></div>`

  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('Connect an agent', 'Connecter un agent')}</h2>
      <p class="hint">${T(
        'An MCP client (Claude Code, Claude Desktop, Cursor, VS Code…) can read and draw in the diagram open in this tab, with the same tools as the built-in assistant.',
        'Un client MCP (Claude Code, Claude Desktop, Cursor, VS Code…) peut lire et dessiner dans le diagramme ouvert dans cet onglet, avec les mêmes outils que l\'assistant intégré.',
      )}</p>
      <h3>${T('MCP server address', 'Adresse du serveur MCP')}</h3>
      ${code('mcp-url')}
      <p class="warn" id="mcp-exposed" hidden></p>
      <p class="hint" id="mcp-auth"></p>
      <h3>Claude Code</h3>
      ${code('mcp-claude-code')}
      <h3>Claude Desktop</h3>
      <p class="hint">${T(
        'In claude_desktop_config.json (Settings, Developer, Edit config), through the mcp-remote bridge, which needs Node.js:',
        'Dans claude_desktop_config.json (Réglages, Développeur, Modifier la configuration), par le relais mcp-remote, qui demande Node.js :',
      )}</p>
      ${code('mcp-claude-desktop')}
      <h3>${T('Other clients (HTTP transport)', 'Autres clients (transport HTTP)')}</h3>
      <p class="hint">${T(
        'For example .mcp.json, Cursor or VS Code: the address with the "http" (Streamable HTTP) type.',
        'Par exemple .mcp.json, Cursor ou VS Code : l\'adresse avec le type « http » (Streamable HTTP).',
      )}</p>
      ${code('mcp-generic')}
      <p class="hint">${T(
        'The agent works in the editor tab used last: keep it open while the agent draws.',
        'L\'agent travaille dans le dernier onglet de l\'éditeur utilisé : gardez-le ouvert pendant qu\'il dessine.',
      )}</p>
      <p class="status" id="mcp-copy-status" role="status"></p>
      <div class="actions">
        <span class="grow"></span>
        <button type="submit" class="btn" value="close">${T('Close', 'Fermer')}</button>
      </div>
    </form>`

  const $ = (sel) => dialog.querySelector(sel)
  const set = (id, text) => { $(`#${id} code`).textContent = text }
  // JSON lisible mais court : listes de textes et petits objets sur une ligne.
  const compact = (value) =>
    JSON.stringify(value, null, 2)
      .replace(/\[\s+([^\[\]{}]*?)\s+\]/g, (_, inner) => `[${inner.split(/,\s+/).join(', ')}]`)
      .replace(/\{\s+("[^"{}]+": "[^"{}]*")\s+\}/g, '{ $1 }')

  function fill(auth) {
    const header = auth ? { Authorization: 'Bearer <MCP_TOKEN>' } : null
    set('mcp-url', mcpUrl)
    set(
      'mcp-claude-code',
      `claude mcp add --transport http bpmn-editor ${mcpUrl}` + (auth ? ' --header "Authorization: Bearer <MCP_TOKEN>"' : ''),
    )
    set(
      'mcp-claude-desktop',
      compact({
        mcpServers: {
          'bpmn-editor': {
            command: 'npx',
            args: ['-y', 'mcp-remote', mcpUrl, ...(auth ? ['--header', 'Authorization: Bearer <MCP_TOKEN>'] : [])],
          },
        },
      }),
    )
    set(
      'mcp-generic',
      compact({ mcpServers: { 'bpmn-editor': { type: 'http', url: mcpUrl, ...(header ? { headers: header } : {}) } } }),
    )

    $('#mcp-auth').textContent = auth
      ? T('This server asks for a token: replace <MCP_TOKEN> with the value of MCP_TOKEN set on the server.',
          'Ce serveur demande un jeton : remplacez <MCP_TOKEN> par la valeur de MCP_TOKEN réglée sur le serveur.')
      : T('No token is asked. Set MCP_TOKEN on the server to require one from MCP clients.',
          'Aucun jeton n\'est demandé. Réglez MCP_TOKEN sur le serveur pour en exiger un des clients MCP.')

    const host = new URL(mcpUrl, location.href).hostname
    const exposed = !LOCAL.includes(host)
    const warn = $('#mcp-exposed')
    warn.hidden = !exposed
    if (exposed) {
      warn.textContent = auth
        ? T(`This installation is reached as ${host}. MCP clients need the token, but the editor pages and saved diagrams have no login: keep it on a trusted network or behind an authenticating proxy.`,
            `Cette installation est jointe sous le nom ${host}. Les clients MCP doivent fournir le jeton, mais les pages de l'éditeur et les diagrammes enregistrés n'ont pas de connexion : gardez-la sur un réseau de confiance ou derrière un proxy qui authentifie.`)
        : T(`This installation is reached as ${host}, and its MCP server has no authentication: anyone who reaches this address can drive the editor. Set MCP_TOKEN, and keep it on a trusted network or behind an authenticating proxy.`,
            `Cette installation est jointe sous le nom ${host}, et son serveur MCP n'a pas d'authentification : quiconque joint cette adresse peut piloter l'éditeur. Réglez MCP_TOKEN, et gardez-la sur un réseau de confiance ou derrière un proxy qui authentifie.`)
    }
  }

  async function show() {
    $('#mcp-copy-status').textContent = ''
    let auth = false
    try {
      const res = await fetch(infoUrl)
      if (res.ok) auth = !!(await res.json()).mcpAuth
    } catch {}
    fill(auth)
    dialog.showModal()
  }

  dialog.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-copy]')
    if (!button) return
    const text = $(`#${button.dataset.copy} code`).textContent
    const status = $('#mcp-copy-status')
    try {
      await navigator.clipboard.writeText(text)
      status.textContent = T('Copied to the clipboard.', 'Copié dans le presse-papiers.')
    } catch {
      const range = document.createRange()
      range.selectNodeContents($(`#${button.dataset.copy}`))
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      status.textContent = T('Automatic copy failed: the text is selected, press Ctrl+C.', 'Copie automatique impossible : le texte est sélectionné, faites Ctrl+C.')
    }
  })

  badge.addEventListener('click', show)
}
