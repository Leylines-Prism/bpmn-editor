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
        'An AI agent installed on a computer (Claude Code, Claude Desktop, Cursor, VS Code…) can read and draw in the diagram open in this tab, with the same tools as the built-in assistant. It talks to the editor through its MCP server. Two steps: protect the access if needed, then declare the editor in your agent.',
        'Un agent IA installé sur un ordinateur (Claude Code, Claude Desktop, Cursor, VS Code…) peut lire et dessiner dans le diagramme ouvert dans cet onglet, avec les mêmes outils que l\'assistant intégré. Il passe par le serveur MCP de l\'éditeur. Deux étapes : protéger l\'accès si besoin, puis déclarer l\'éditeur dans votre agent.',
      )}</p>

      <h3>${T('MCP server address', 'Adresse du serveur MCP')}</h3>
      <p class="hint" id="mcp-url-hint"></p>
      ${code('mcp-url')}
      <p class="warn" id="mcp-exposed" hidden></p>

      <h3>${T('Step 1 (optional): protect the access with a token', 'Étape 1 (facultative) : protéger l\'accès par un jeton')}</h3>
      <p class="hint">${T(
        'A token is a password that the agent must give to drive the editor. If the editor and the agent run on the same computer, you can skip this step. It matters as soon as the editor can be reached from other machines.',
        'Un jeton est un mot de passe que l\'agent doit donner pour piloter l\'éditeur. Si l\'éditeur et l\'agent tournent sur le même ordinateur, vous pouvez passer cette étape. Elle compte dès que l\'éditeur est joignable depuis d\'autres machines.',
      )}</p>
      <p class="hint" id="mcp-auth"></p>
      <ol class="steps">
        <li id="mcp-step-generate">
          <p class="hint" id="mcp-token-label"></p>
          <div class="token-row">
            <input type="text" id="mcp-token" spellcheck="false" autocomplete="off" placeholder="${T('Paste the token, or generate one', 'Collez le jeton, ou générez-en un')}" aria-label="${T('MCP token', 'Jeton MCP')}" />
            <button type="button" class="btn" id="mcp-token-generate">${T('Generate a token', 'Générer un jeton')}</button>
          </div>
        </li>
        <li class="new-token">
          <p class="hint">${T(
            'Open the folder where the editor is installed, then its <strong>mcp</strong> subfolder, and open the <strong>.env</strong> file with a text editor (Notepad, for example). If there is no .env file, copy <strong>.env.example</strong> and rename the copy to .env. Add this line at the end, then save the file:',
            'Ouvrez le dossier où l\'éditeur est installé, puis son sous-dossier <strong>mcp</strong>, et ouvrez le fichier <strong>.env</strong> avec un éditeur de texte (le Bloc-notes, par exemple). S\'il n\'y a pas de fichier .env, copiez <strong>.env.example</strong> et renommez la copie en .env. Ajoutez cette ligne à la fin, puis enregistrez le fichier :',
          )}</p>
          ${code('mcp-env')}
        </li>
        <li class="new-token">
          <p class="hint" id="mcp-restart"></p>
        </li>
        <li class="new-token">
          <p class="hint">${T(
            'Go on to step 2: the settings there already hold the token. The token is kept nowhere else, so copy it before you close this page, or generate a new one.',
            'Passez à l\'étape 2 : les réglages contiennent déjà le jeton. Le jeton n\'est gardé nulle part ailleurs : copiez-le avant de fermer cette page, ou générez-en un nouveau.',
          )}</p>
        </li>
      </ol>

      <h3>${T('Step 2: declare the editor in your agent', 'Étape 2 : déclarer l\'éditeur dans votre agent')}</h3>
      <p class="hint">${T('Pick your agent below and copy its setting with the Copy button.', 'Choisissez votre agent ci-dessous et copiez son réglage avec le bouton Copier.')}</p>
      <h4>Claude Code</h4>
      <p class="hint">${T('In a terminal, paste this command and press Enter:', 'Dans un terminal, collez cette commande et appuyez sur Entrée :')}</p>
      ${code('mcp-claude-code')}
      <h4>Claude Desktop</h4>
      <p class="hint">${T(
        'In Claude Desktop, open Settings, then Developer, then Edit config. In the claude_desktop_config.json file that opens, paste this block (if the file already has a "mcpServers" block, add only the "bpmn-editor" entry inside it). Save, then quit and restart Claude Desktop. This setting goes through the small mcp-remote program, which needs Node.js installed on the computer.',
        'Dans Claude Desktop, ouvrez Réglages, puis Développeur, puis Modifier la configuration. Dans le fichier claude_desktop_config.json qui s\'ouvre, collez ce bloc (si le fichier a déjà un bloc « mcpServers », ajoutez seulement l\'entrée « bpmn-editor » dedans). Enregistrez, puis quittez et relancez Claude Desktop. Ce réglage passe par le petit programme mcp-remote, qui demande Node.js installé sur l\'ordinateur.',
      )}</p>
      ${code('mcp-claude-desktop')}
      <h4>${T('Cursor, VS Code and other agents', 'Cursor, VS Code et les autres agents')}</h4>
      <p class="hint">${T(
        'Add this block to the agent\'s MCP settings file (for example .mcp.json, or the MCP settings of Cursor and VS Code). It uses the "http" type (Streamable HTTP).',
        'Ajoutez ce bloc au fichier de réglages MCP de l\'agent (par exemple .mcp.json, ou les réglages MCP de Cursor et VS Code). Il utilise le type « http » (Streamable HTTP).',
      )}</p>
      ${code('mcp-generic')}

      <h3>${T('Check that it works', 'Vérifier que ça marche')}</h3>
      <p class="hint">${T(
        'Ask your agent: "Describe the diagram open in the BPMN editor." It works in the editor tab used last: keep that tab open while it draws.',
        'Demandez à votre agent : « Décris le diagramme ouvert dans l\'éditeur BPMN. » Il travaille dans le dernier onglet de l\'éditeur utilisé : gardez cet onglet ouvert pendant qu\'il dessine.',
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
  // En docker, le serveur MCP est servi par le site lui-même ; en développement, à part.
  const docker = new URL(mcpUrl, location.href).origin === location.origin

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
      ? T('This server already asks for a token. Paste it below: it is the MCP_TOKEN value in the mcp/.env file of the editor. The settings of step 2 then hold it.',
          'Ce serveur demande déjà un jeton. Collez-le ci-dessous : c\'est la valeur MCP_TOKEN du fichier mcp/.env de l\'éditeur. Les réglages de l\'étape 2 le contiennent alors.')
      : T('This server asks for no token for now. To set one:', 'Ce serveur ne demande pas de jeton pour l\'instant. Pour en mettre un :')
    $('#mcp-token-label').textContent = serverAuth
      ? T('The token of this server:', 'Le jeton de ce serveur :')
      : T('Click "Generate a token". A random token appears in the field.', 'Cliquez sur « Générer un jeton ». Un jeton tiré au hasard apparaît dans le champ.')
    $('#mcp-token-generate').hidden = serverAuth
    dialog.querySelector('.steps').classList.toggle('single', serverAuth)
    for (const li of dialog.querySelectorAll('.new-token')) li.hidden = serverAuth
    set('mcp-env', token ? `MCP_TOKEN=${token}` : T('MCP_TOKEN=<generate a token first>', 'MCP_TOKEN=<générez d\'abord un jeton>'))
    $('[data-copy="mcp-env"]').disabled = !token
    $('#mcp-restart').textContent = docker
      ? T('Restart the editor so that it reads the token: in a terminal opened in the editor folder, type docker compose up -d and press Enter.',
          'Relancez l\'éditeur pour qu\'il lise le jeton : dans un terminal ouvert dans le dossier de l\'éditeur, tapez docker compose up -d et appuyez sur Entrée.')
      : T('Restart the MCP server so that it reads the token: in the terminal where it runs, press Ctrl+C, then type npm start and press Enter.',
          'Relancez le serveur MCP pour qu\'il lise le jeton : dans le terminal où il tourne, faites Ctrl+C, puis tapez npm start et appuyez sur Entrée.')

    const host = new URL(mcpUrl, location.href).hostname
    const exposed = !LOCAL.includes(host)
    $('#mcp-url-hint').textContent = !docker
      ? T('This is the address where the agent reaches the editor. In development, the MCP server runs on its own port, on this computer. The settings of step 2 already hold it.',
          'C\'est l\'adresse à laquelle l\'agent joint l\'éditeur. En développement, le serveur MCP tourne sur son propre port, sur cet ordinateur. Les réglages de l\'étape 2 la contiennent déjà.')
      : exposed
        ? T(`This is the address where the agent reaches the editor: the address in your browser bar, followed by /mcp. An agent on any machine that reaches ${host} can use it. The settings of step 2 already hold it.`,
            `C'est l'adresse à laquelle l'agent joint l'éditeur : celle de la barre d'adresse de votre navigateur, suivie de /mcp. Un agent sur n'importe quelle machine qui joint ${host} peut l'utiliser. Les réglages de l'étape 2 la contiennent déjà.`)
        : T('This is the address where the agent reaches the editor: the address in your browser bar, followed by /mcp. "localhost" means "this computer", so it works for an agent on this computer. For an agent on another machine, open the editor with this computer\'s network address or domain name instead (see "Connect an agent" in the README): this window then shows that address.',
            'C\'est l\'adresse à laquelle l\'agent joint l\'éditeur : celle de la barre d\'adresse de votre navigateur, suivie de /mcp. « localhost » veut dire « cet ordinateur » : elle marche pour un agent sur cet ordinateur. Pour un agent sur une autre machine, ouvrez plutôt l\'éditeur avec l\'adresse réseau ou le nom de domaine de cet ordinateur (voir « Connecter un agent » dans le README) : cette fenêtre affiche alors cette adresse.')
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
