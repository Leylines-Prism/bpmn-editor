// Panneau de chat intégré : l'utilisateur décrit un processus, l'IA le dessine
// dans cet onglet par le serveur (dossier mcp/, route /chat). La clé d'API
// reste sur le serveur, le navigateur n'en voit jamais.

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
#chat-log { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 1.45; }
.chat-msg { padding: 8px 10px; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-msg.user { align-self: flex-end; max-width: 85%; background: #0f3460; }
.chat-msg.assistant { background: #1f2a4a; }
.chat-msg.notice { color: #9ca3af; font-size: 12px; background: transparent; padding: 0 2px; }
.chat-msg.error { color: #fca5a5; font-size: 12px; background: rgba(233,69,96,0.12); }
.chat-tools { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.chat-tools span { font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px solid #0f3460; color: #9ca3af; white-space: nowrap; }
.chat-tools span.failed { color: #fca5a5; border-color: #e94560; }
#chat-form { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #0f3460; }
#chat-input { flex: 1; resize: none; height: 60px; padding: 6px 8px; border-radius: 4px; border: 1px solid #0f3460; background: #1a1a2e; color: #e0e0e0; font: inherit; font-size: 13px; }
#chat-input:disabled { opacity: 0.5; }
`

export function createChatPanel({ chatUrl, bridge }) {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const panel = document.createElement('aside')
  panel.id = 'chat-panel'
  panel.innerHTML = `
    <header><span>Assistant IA</span><button class="btn" type="button" id="chat-reset">Nouvelle discussion</button></header>
    <div id="chat-log" aria-live="polite"></div>
    <form id="chat-form">
      <textarea id="chat-input" placeholder="Décrivez le processus à dessiner, ou ce qu'il faut changer…"></textarea>
      <button class="btn" type="submit" id="chat-send">Envoyer</button>
    </form>`
  document.getElementById('canvas').after(panel)

  const toggle = document.createElement('button')
  toggle.className = 'btn'
  toggle.id = 'btn-chat'
  toggle.type = 'button'
  toggle.textContent = '💬 Assistant'
  document.getElementById('btn-simulation').after(toggle)

  const log = panel.querySelector('#chat-log')
  const form = panel.querySelector('#chat-form')
  const input = panel.querySelector('#chat-input')
  const sendButton = panel.querySelector('#chat-send')

  let conversationId = null
  let controller = null // requête en cours, pour le bouton « Arrêter »
  let checked = false

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
  }

  // Vérifie une fois, à l'ouverture, que le serveur répond et que le chat est configuré.
  async function checkServer() {
    try {
      const res = await fetch(chatUrl)
      const status = await res.json()
      checked = true
      if (!status.enabled) {
        add('notice', "Le chat n'est pas configuré : ajoutez ANTHROPIC_API_KEY dans mcp/.env puis relancez le serveur.")
      } else if (!log.childElementCount) {
        add('notice', `Décrivez un processus et je le dessine sur le canevas. Les modifications s'annulent avec Ctrl+Z, sauf la mise en page automatique.`)
      }
    } catch {
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

  panel.querySelector('#chat-reset').addEventListener('click', () => {
    controller?.abort()
    conversationId = null
    log.replaceChildren()
    checked = false
    checkServer()
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
    if (!bridge.tabId) {
      add('error', "L'éditeur n'est pas relié au serveur (badge MCP hors ligne).")
      return
    }
    input.value = ''
    send(text)
  })

  async function send(text) {
    add('user', text)
    const reply = add('assistant')
    reply.textContent = '…'
    let tools = null
    let gotText = false
    let toolSinceText = false
    controller = new AbortController()
    setBusy(true)

    const handle = (event) => {
      if (event.type === 'conversation') {
        conversationId = event.id
      } else if (event.type === 'text') {
        if (!gotText) reply.textContent = ''
        // Un paragraphe par étape : le texte qui suit des appels d'outils repart à la ligne.
        const chunk = (toolSinceText && reply.firstChild !== tools ? '\n\n' : '') + event.text
        gotText = true
        toolSinceText = false
        // Le texte s'ajoute avant la ligne des outils.
        if (tools) reply.insertBefore(document.createTextNode(chunk), tools)
        else reply.append(chunk)
      } else if (event.type === 'tool') {
        if (!gotText) {
          reply.textContent = ''
          gotText = true
        }
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
      } else if (event.type === 'error') {
        add('error', event.message)
      }
      log.scrollTop = log.scrollHeight
    }

    try {
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, tabId: bridge.tabId, text }),
        signal: controller.signal,
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
    } catch (err) {
      if (err.name === 'AbortError') add('notice', 'Réponse interrompue.')
      else add('error', `Échec de l'envoi : ${err.message}`)
    } finally {
      if (!gotText) reply.remove()
      controller = null
      setBusy(false)
      input.focus()
    }
  }
}
