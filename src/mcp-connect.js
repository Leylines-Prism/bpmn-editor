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
      <h3>${T('Token (optional)', 'Jeton (facultatif)')}</h3>
      <p class="hint" id="mcp-auth"></p>
      <div class="token-row">
        <input type="text" id="mcp-token" spellcheck="false" autocomplete="off" placeholder="${T('Paste the token, or generate one', 'Collez le jeton, ou générez-en un')}" aria-label="${T('MCP token', 'Jeton MCP')}" />
        <button type="button" class="btn" id="mcp-token-generate">${T('Generate a token', 'Générer un jeton')}</button>
      </div>
      <div id="mcp-env-block" hidden>
        <p class="hint">${T('Add this line to mcp/.env (the same file as the API keys), then restart the server: docker compose up -d, or npm start in mcp/.',
                          'Ajoutez cette ligne à mcp/.env (le même fichier que les clés d\'API), puis relancez le serveur : docker compose up -d, ou npm start dans mcp/.')}</p>
        ${code('mcp-env')}
      </div>
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

  const tokenInput = $('#mcp-token')
  let serverAuth = false

  function fill() {
    const token = tokenInput.value.trim()
    const auth = serverAuth || !!token
    const value = token || '<MCP_TOKEN>'
    const header = auth ? { Authorization: `Bearer ${value}` } : null
    set('mcp-url', mcpUrl)
    set(
      'mcp-claude-code',
      `claude mcp add --transport http bpmn-editor ${mcpUrl}` + (auth ? ` --header "Authorization: Bearer ${value}"` : ''),
    )
    set(
      'mcp-claude-desktop',
      compact({
        mcpServers: {
          'bpmn-editor': {
            command: 'npx',
            args: ['-y', 'mcp-remote', mcpUrl, ...(auth ? ['--header', `Authorization: Bearer ${value}`] : [])],
          },
        },
      }),
    )
    set(
      'mcp-generic',
      compact({ mcpServers: { 'bpmn-editor': { type: 'http', url: mcpUrl, ...(header ? { headers: header } : {}) } } }),
    )

    $('#mcp-auth').textContent = serverAuth
      ? T('This server asks for a token (MCP_TOKEN in mcp/.env). Paste it here to fill in the settings below.',
          'Ce serveur demande un jeton (MCP_TOKEN dans mcp/.env). Collez-le ici pour remplir les réglages ci-dessous.')
      : T('This server asks for no token. Generate one to require it from MCP clients: the settings below are filled in with it.',
          'Ce serveur ne demande pas de jeton. Générez-en un pour l\'exiger des clients MCP : les réglages ci-dessous sont remplis avec lui.')
    // La ligne pour mcp/.env n'est utile que pour un nouveau jeton.
    $('#mcp-env-block').hidden = !token || serverAuth
    set('mcp-env', `MCP_TOKEN=${token}`)

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
    try {
      const res = await fetch(infoUrl)
      if (res.ok) serverAuth = !!(await res.json()).mcpAuth
    } catch {}
    fill()
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

  // Jeton tiré au hasard dans le navigateur (32 octets, en hexadécimal). Il n'est envoyé
  // nulle part : la page ne peut pas écrire mcp/.env, il faut y coller la ligne.
  $('#mcp-token-generate').addEventListener('click', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    tokenInput.value = [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('')
    fill()
  })
  tokenInput.addEventListener('input', fill)

  badge.addEventListener('click', show)
}
