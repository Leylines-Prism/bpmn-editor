// Panneau de chat intégré : l'utilisateur décrit un processus, l'IA le dessine
// dans cet onglet.
//
// Deux modes :
//   - « server » (version docker, développement) : la boucle tourne sur le serveur
//     (dossier mcp/, route /chat), qui exécute les outils dans l'onglet par le pont.
//     Les modèles viennent du serveur (variables d'environnement) ou de la fenêtre
//     Options, dont la clé part avec chaque message et n'est pas enregistrée.
//   - « online » (site public) : la boucle tourne dans la page et appelle
//     directement le fournisseur réglé dans Options, avec la clé du visiteur.

import { describeProviderError } from './ai/errors.js'
import { listModels } from './ai/providers.js'
import { connectionFor, loadSettings, userModels } from './ai-settings.js'
import { createOptionsDialog } from './options-dialog.js'

const TOOL_LABELS = {
  get_shapes: 'lecture du diagramme',
  get_diagram_xml: 'lecture du XML',
  set_diagram_xml: 'remplacement du diagramme',
  add_shapes: 'ajout de formes',
  connect_shapes: 'connexions',
  update_elements: 'modification',
  remove_elements: 'suppression',
  auto_layout: 'mise en page',
  validate_diagram: 'validation',
}

const CSS = `
#chat-panel { width: 340px; flex-shrink: 0; display: none; flex-direction: column; background: #16213e; border-left: 1px solid #0f3460; }
#chat-panel.open { display: flex; }
#chat-panel header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #0f3460; font-size: 13px; font-weight: 600; }
#chat-panel header span { flex: 1; }
#chat-panel header .btn { font-size: 12px; height: 28px; padding: 0 8px; }
#chat-log { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 1.45; }
.chat-msg { padding: 8px 10px; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-msg.user { align-self: flex-end; max-width: 85%; background: #0f3460; }
.chat-msg.assistant { background: #1f2a4a; }
.chat-msg.notice { color: #9ca3af; font-size: 12px; background: transparent; padding: 0 2px; }
.chat-msg.error { color: #fca5a5; font-size: 12px; background: rgba(233,69,96,0.12); }
.chat-tools { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.chat-tools span { font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px solid #0f3460; color: #9ca3af; white-space: nowrap; }
.chat-tools span.failed { color: #fca5a5; border-color: #e94560; }
.chat-status { font-size: 11px; color: #9ca3af; margin-top: 6px; }
#chat-form { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #0f3460; }
#chat-input { flex: 1; resize: none; height: 60px; padding: 6px 8px; border-radius: 4px; border: 1px solid #0f3460; background: #1a1a2e; color: #e0e0e0; font: inherit; font-size: 13px; }
#chat-input:disabled { opacity: 0.5; }
#chat-options { display: flex; align-items: center; gap: 6px; padding: 6px 8px 0; font-size: 12px; color: #9ca3af; }
#chat-options[hidden] { display: none; }
#chat-model { flex: 1; min-width: 0; height: 26px; border-radius: 4px; border: 1px solid #0f3460; background: #1a1a2e; color: #e0e0e0; font: inherit; }
`

const MODEL_STORAGE_KEY = 'bpmn-editor-chat-model'
function readStoredModel() {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY)
  } catch {
    return null
  }
}
function storeModel(value) {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, value)
  } catch {}
}

// mode : « server » ou « online ». En mode server : chatUrl et bridge (pont MCP).
// En mode online : tools, les outils exécutés sur le bpmn-js de la page.
// Longueur maximale d'un message, la même que celle acceptée par le serveur.
const MAX_MESSAGE = 100000

const EXPAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg>`

export function createChatPanel({ mode, chatUrl, bridge, tools }) {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const panel = document.createElement('aside')
  panel.id = 'chat-panel'
  panel.innerHTML = `
    <header><span>Assistant IA</span><button class="btn" type="button" id="chat-settings" title="Fournisseurs, clés et modèles">Options</button><button class="btn" type="button" id="chat-reset">Nouvelle discussion</button></header>
    <div id="chat-log" aria-live="polite"></div>
    <div id="chat-options" hidden>
      <label for="chat-model">Modèle</label>
      <select id="chat-model"></select>
    </div>
    <form id="chat-form">
      <div class="chat-input-wrap">
        <textarea id="chat-input" placeholder="Décrivez le processus à dessiner, ou ce qu'il faut changer…"></textarea>
        <button type="button" id="chat-expand" title="Agrandir la zone de saisie" aria-label="Agrandir la zone de saisie">${EXPAND_ICON}</button>
      </div>
      <button class="btn primary" type="submit" id="chat-send">Envoyer</button>
    </form>
    <dialog id="chat-editor">
      <form method="dialog">
        <h2>Message à l'assistant</h2>
        <textarea id="chat-editor-text" placeholder="Collez ou écrivez un long message. Ctrl+Entrée pour envoyer."></textarea>
        <div class="chat-editor-actions">
          <button class="btn" type="button" id="chat-editor-file">Ouvrir un fichier texte…</button>
          <input type="file" id="chat-editor-input" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden>
          <span class="chat-editor-count" aria-live="polite"></span>
          <button class="btn" type="submit" value="close">Fermer</button>
          <button class="btn primary" type="submit" value="send" id="chat-editor-send">Envoyer</button>
        </div>
      </form>
    </dialog>`
  document.getElementById('canvas').after(panel)

  const toggle = document.createElement('button')
  toggle.className = 'btn'
  toggle.id = 'btn-chat'
  toggle.type = 'button'
  toggle.textContent = 'Assistant IA'
  document.getElementById('btn-simulation').after(toggle)

  const log = panel.querySelector('#chat-log')
  const form = panel.querySelector('#chat-form')
  const input = panel.querySelector('#chat-input')
  const sendButton = panel.querySelector('#chat-send')
  const modelBar = panel.querySelector('#chat-options')
  const modelSelect = panel.querySelector('#chat-model')

  let controller = null // requête en cours, pour le bouton « Arrêter »
  let checked = false
  let settings = loadSettings()
  let serverModels = [] // { id, label, provider, providerLabel }, envoyés par le serveur
  let models = [] // serverModels puis modèles de la fenêtre Options
  // Discussion en cours : sur le serveur ({ id }) ou dans la page ({ messages }).
  // kind « server:anthropic », « local:openai »… : l'historique ne passe pas d'un format à l'autre.
  let conversation = null

  const currentModel = () => models.find((m) => m.id === modelSelect.value)
  const kindOf = (m) => `${mode === 'online' ? 'local' : 'server'}:${m.source === 'user' ? m.format : m.provider}`

  const options = createOptionsDialog({
    mode,
    test: testConnection,
    onSave(saved) {
      settings = saved
      fillModels()
      if (saved.defaultModel && models.some((m) => m.id === saved.defaultModel)) {
        modelSelect.value = saved.defaultModel
        storeModel(saved.defaultModel)
      }
      announce()
      input.focus()
    },
  })

  // Bouton Tester ou Lister : directement depuis la page en ligne, par le serveur sinon.
  async function testConnection(conn) {
    if (mode === 'online') {
      try {
        return await listModels({ ...conn, browser: true, signal: AbortSignal.timeout(15000) })
      } catch (err) {
        throw new Error(describeProviderError(err, { label: conn.label, providerId: conn.provider, browser: true, origin: location.origin }))
      }
    }
    let res
    try {
      res = await fetch(`${chatUrl}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conn),
      })
    } catch {
      throw new Error('Serveur injoignable. Lancez-le avec : cd mcp && npm start')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) throw new Error(data.error || `le serveur a répondu ${res.status}`)
    return data.models
  }

  // Remplit le menu, groupé par fournisseur. Garde le choix précédent s'il existe encore.
  function fillModels() {
    models = [...serverModels.map((m) => ({ ...m, source: 'server' })), ...userModels(settings)]
    modelSelect.replaceChildren()
    const groups = new Map()
    for (const m of models) {
      let group = groups.get(m.provider)
      if (!group) {
        group = document.createElement('optgroup')
        group.label = m.providerLabel || m.provider
        groups.set(m.provider, group)
        modelSelect.append(group)
      }
      const option = document.createElement('option')
      option.value = m.id
      option.textContent = m.label
      group.append(option)
    }
    // Un seul fournisseur : les groupes n'apportent rien.
    if (groups.size === 1) {
      const [group] = groups.values()
      modelSelect.replaceChildren(...group.children)
    }
    const stored = readStoredModel()
    const fallback = models.some((m) => m.id === settings.defaultModel) ? settings.defaultModel : serverDefault || models[0]?.id || ''
    modelSelect.value = models.some((m) => m.id === stored) ? stored : fallback
    modelBar.hidden = models.length < 2
  }
  let serverDefault = null

  // Message d'accueil, ou marche à suivre si aucun modèle n'est disponible.
  function announce() {
    if (!models.length) {
      add(
        'notice',
        mode === 'online'
          ? 'Pour commencer, ouvrez Options et activez un fournisseur : Anthropic, OpenAI, Ollama ou un serveur compatible OpenAI.'
          : "Le chat n'est pas configuré : ouvrez Options pour régler un fournisseur, ou ajoutez ANTHROPIC_API_KEY ou OPENAI_MODELS dans mcp/.env puis relancez le serveur.",
      )
    } else if (!log.querySelector('.chat-msg:not(.notice)') && !log.querySelector('.welcome')) {
      add('notice', `Décrivez un processus et je le dessine sur le canevas. Les modifications s'annulent avec Ctrl+Z, sauf la mise en page automatique.`).classList.add('welcome')
    }
  }
  function add(kind, text = '') {
    const el = document.createElement('div')
    el.className = `chat-msg ${kind}`
    el.textContent = text
    log.append(el)
    log.scrollTop = log.scrollHeight
    return el
  }

  function setBusy(busy) {
    sendButton.textContent = busy ? 'Arrêter' : 'Envoyer'
    input.disabled = busy
    modelSelect.disabled = busy
  }

  // À l'ouverture : en mode server, demande au serveur ses modèles.
  async function checkServer() {
    checked = true
    if (mode === 'online') {
      fillModels()
      announce()
      return
    }
    try {
      const res = await fetch(chatUrl)
      const status = await res.json()
      serverModels = Array.isArray(status.models) ? status.models : []
      serverDefault = status.model
      fillModels()
      announce()
    } catch {
      checked = false
      fillModels()
      add('notice', 'Serveur injoignable. Lancez-le avec : cd mcp && npm start')
    }
  }

  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('open')
    toggle.classList.toggle('active', open)
    if (open) {
      if (!checked) checkServer()
      input.focus()
    }
  })

  panel.querySelector('#chat-settings').addEventListener('click', () => options.open(settings, { server: serverModels }))

  panel.querySelector('#chat-reset').addEventListener('click', () => {
    controller?.abort()
    conversation = null
    log.replaceChildren()
    checked = false
    checkServer()
  })

  modelSelect.addEventListener('change', () => {
    storeModel(modelSelect.value)
    const model = currentModel()
    if (!model) return
    // Un historique ne passe pas d'un format d'API à l'autre.
    if (conversation && conversation.kind !== kindOf(model)) {
      conversation = null
      add('notice', `Autre fournisseur : la discussion repart de zéro avec ${model.label}. Le diagramme, lui, ne change pas.`)
    } else if (conversation) {
      add('notice', `Les prochains messages iront à ${model.label}.`)
    }
    input.focus()
  })

  // Zone de saisie : grandit avec le texte jusqu'à la moitié du panneau.
  const MIN_INPUT = 72
  function fitInput() {
    input.style.height = 'auto'
    const max = Math.max(MIN_INPUT, Math.round(panel.clientHeight * 0.5))
    input.style.height = `${Math.min(Math.max(input.scrollHeight + 2, MIN_INPUT), max)}px`
    input.style.overflowY = input.scrollHeight + 2 > max ? 'auto' : 'hidden'
  }
  input.addEventListener('input', fitInput)

  // Grand éditeur, pour coller ou écrire un long message, ou l'ouvrir depuis un fichier.
  const editor = panel.querySelector('#chat-editor')
  const editorText = panel.querySelector('#chat-editor-text')
  const editorFile = panel.querySelector('#chat-editor-input')
  const editorCount = panel.querySelector('.chat-editor-count')
  const countChars = () => {
    const n = editorText.value.length
    editorCount.textContent = n ? `${n.toLocaleString('fr-FR')} caractère${n > 1 ? 's' : ''}${n > MAX_MESSAGE ? ` : trop long, ${MAX_MESSAGE.toLocaleString('fr-FR')} au plus` : ''}` : ''
    editorCount.classList.toggle('too-long', n > MAX_MESSAGE)
  }
  panel.querySelector('#chat-expand').addEventListener('click', () => {
    editorText.value = input.value
    countChars()
    editor.showModal()
    editorText.focus()
    editorText.setSelectionRange(editorText.value.length, editorText.value.length)
  })
  editorText.addEventListener('input', countChars)
  editorText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      editor.close('send')
    }
  })
  panel.querySelector('#chat-editor-file').addEventListener('click', () => editorFile.click())
  editorFile.addEventListener('change', async () => {
    const file = editorFile.files[0]
    editorFile.value = ''
    if (!file) return
    if (file.size > MAX_MESSAGE * 4) {
      editorCount.textContent = 'Fichier trop volumineux.'
      return
    }
    const text = await file.text()
    const { selectionStart: a, selectionEnd: b, value } = editorText
    editorText.value = value.slice(0, a) + text + value.slice(b)
    countChars()
    editorText.focus()
  })
  editor.addEventListener('close', () => {
    input.value = editorText.value
    fitInput()
    if (editor.returnValue === 'send' && !input.disabled) form.requestSubmit()
    else input.focus()
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      form.requestSubmit()
    }
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (controller) {
      controller.abort()
      return
    }
    const text = input.value.trim()
    if (!text) return
    if (text.length > MAX_MESSAGE) {
      add('error', `Message trop long : ${MAX_MESSAGE.toLocaleString('fr-FR')} caractères au plus.`)
      return
    }
    if (!currentModel()) {
      add('error', 'Aucun modèle disponible : ouvrez Options pour régler un fournisseur.')
      return
    }
    if (mode !== 'online' && !bridge.tabId) {
      add('error', "L'éditeur n'est pas relié au serveur (badge MCP hors ligne).")
      return
    }
    input.value = ''
    fitInput()
    send(text)
  })

  async function send(text) {
    add('user', text)
    const reply = add('assistant')
    reply.hidden = true // affichée au premier texte ou au premier outil
    let tools = null
    let gotText = false
    let toolSinceText = false
    let failed = false
    controller = new AbortController()
    setBusy(true)

    // Ligne d'état sous la réponse : ce que fait l'assistant et depuis combien de temps.
    const status = document.createElement('div')
    status.className = 'chat-status'
    let statusText = 'envoi'
    const started = Date.now()
    const renderStatus = () => {
      status.textContent = `⏳ ${statusText}… ${Math.round((Date.now() - started) / 1000)} s`
    }
    renderStatus()
    log.append(status)
    const timer = setInterval(renderStatus, 1000)

    const model = currentModel()
    const handle = (event) => {
      if (event.type === 'text') statusText = 'rédige'
      if (event.type === 'conversation') {
        conversation = { kind: kindOf(model), id: event.id }
      } else if (event.type === 'text') {
        reply.hidden = false
        // Un paragraphe par étape : le texte qui suit des appels d'outils repart à la ligne.
        const chunk = (toolSinceText && reply.firstChild !== tools ? '\n\n' : '') + event.text
        gotText = true
        toolSinceText = false
        // Le texte s'ajoute avant la ligne des outils.
        if (tools) reply.insertBefore(document.createTextNode(chunk), tools)
        else reply.append(chunk)
      } else if (event.type === 'tool') {
        reply.hidden = false
        gotText = true
        if (!tools) {
          tools = document.createElement('div')
          tools.className = 'chat-tools'
          reply.append(tools)
        }
        toolSinceText = true
        const chip = document.createElement('span')
        chip.textContent = `${event.ok ? '✓' : '✗'} ${TOOL_LABELS[event.name] || event.name}`
        chip.title = event.error || event.name
        if (!event.ok) chip.classList.add('failed')
        tools.append(chip)
      } else if (event.type === 'status') {
        const label = TOOL_LABELS[event.tool] || event.tool
        if (event.phase === 'thinking') statusText = 'réflexion'
        else if (event.phase === 'preparing')
          statusText = `prépare : ${label}` + (event.size ? ` (${(event.size / 1024).toFixed(1)} Ko)` : '')
        else if (event.phase === 'running') statusText = `exécute : ${label}`
        renderStatus()
      } else if (event.type === 'error') {
        failed = true
        add('error', event.message)
      }
      log.scrollTop = log.scrollHeight
    }

    const conn = model.source === 'user' ? connectionFor(model, settings) : null
    try {
      if (mode === 'online') await sendLocal({ conn, model, text, handle, signal: controller.signal })
      else await sendServer({ conn, model, text, handle, signal: controller.signal })
    } catch (err) {
      failed = true
      if (controller.signal.aborted) add('notice', 'Réponse interrompue.')
      else if (conn && mode === 'online') add('error', describeProviderError(err, { label: conn.label, providerId: conn.provider, browser: true, origin: location.origin }))
      else add('error', `Échec de l'envoi : ${err.message}`)
    } finally {
      clearInterval(timer)
      status.remove()
      if (!gotText) reply.remove()
      if (!gotText && !failed) add('notice', "Le modèle n'a rien répondu. Vérifiez qu'il sait appeler des outils, ou essayez un autre modèle.")
      controller = null
      setBusy(false)
      input.focus()
    }
  }

  // Version docker : le serveur fait la boucle et renvoie un flux SSE.
  async function sendServer({ conn, model, text, handle, signal }) {
    const body = { conversationId: conversation?.id, tabId: bridge.tabId, text }
    if (conn) body.custom = conn
    else body.model = model.id
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) throw new Error(`le serveur a répondu ${res.status}`)
    // Flux SSE : des blocs « data: {json} » séparés par une ligne vide.
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let cut
      while ((cut = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 2)
        const data = block.replace(/^data: /, '')
        try {
          handle(JSON.parse(data))
        } catch (err) {
          console.warn('[chat] événement illisible :', data, err)
        }
      }
    }
  }

  // Version en ligne : la boucle tourne ici, les outils agissent sur cette page.
  async function sendLocal({ conn, model, text, handle, signal }) {
    const engine = await loadEngine()
    const kind = kindOf(model)
    if (!conversation || conversation.kind !== kind || !conversation.messages) conversation = { kind, messages: [] }
    const conv = conversation
    const common = {
      model: conn.model,
      conv,
      text,
      toolSet: engine.toolSet,
      executeTool: async (name, args) => {
        const tool = tools[name]
        if (!tool) throw new Error(`Outil inconnu : ${name}`)
        return tool(args)
      },
      emit: handle,
      signal,
      log: (...args) => console.warn(...args),
    }
    if (conn.format === 'anthropic') {
      const client = new engine.Anthropic({ apiKey: conn.apiKey, authToken: null, baseURL: conn.baseUrl, dangerouslyAllowBrowser: true })
      await engine.runAnthropicTurn({ ...common, client, APIError: engine.Anthropic.APIError })
    } else {
      const client = new engine.OpenAICompatClient({ baseUrl: conn.baseUrl, apiKey: conn.apiKey })
      await engine.runOpenAITurn({ ...common, client })
    }
  }
}

// Chargé au premier message seulement : le SDK et zod ne pèsent rien avant.
let enginePromise = null
function loadEngine() {
  enginePromise ??= Promise.all([
    import('@anthropic-ai/sdk'),
    import('zod/v4'),
    import('./ai/chat-loop.js'),
    import('./ai/openai-compat.js'),
  ]).then(([{ default: Anthropic }, z, loop, { OpenAICompatClient }]) => ({
    Anthropic,
    OpenAICompatClient,
    runAnthropicTurn: loop.runAnthropicTurn,
    runOpenAITurn: loop.runOpenAITurn,
    toolSet: loop.createToolSet(z),
  }))
  enginePromise.catch(() => (enginePromise = null))
  return enginePromise
}
