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
import { lang, num, T } from './i18n/lang.js'
import { IMAGE_TYPES, MAX_ATTACHMENTS, MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_TOTAL_BYTES, PDF_TYPE, supports } from './ai/attachments.js'
import { makeResizable } from './panel-resize.js'
import { trackOnce } from './analytics.js'
import { newAiRound } from './ai-changes.js'

const TOOL_LABELS = {
  get_shapes: T('reading the diagram', 'lecture du diagramme'),
  get_diagram_xml: T('reading the XML', 'lecture du XML'),
  get_diagram_image: T('looking at the diagram', 'coup d\'œil au diagramme'),
  set_diagram_xml: T('replacing the diagram', 'remplacement du diagramme'),
  add_shapes: T('adding shapes', 'ajout de formes'),
  connect_shapes: T('connections', 'connexions'),
  update_elements: T('changes', 'modification'),
  remove_elements: T('removal', 'suppression'),
  auto_layout: T('layout', 'mise en page'),
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
#chat-model-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`


// mode : « server » ou « online ». En mode server : chatUrl et bridge (pont MCP).
// En mode online : tools, les outils exécutés sur le bpmn-js de la page.
// Longueur maximale d'un message, la même que celle acceptée par le serveur.
const MAX_MESSAGE = 100000

const EXPAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg>`

const ATTACH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5 12.5 20a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6L15.5 6.6"/></svg>`
const PDF_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 16.5v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5M13 12.5v4h.8a2 2 0 0 0 0-4zM17.5 12.5h-1.6v4M15.9 14.5h1.3"/></svg>`
const MAX_IMAGE_SIDE = 1568 // au-delà, l'image est réduite : le modèle n'en voit pas plus

const sizeText = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} ${T('MB', 'Mo')}` : `${Math.max(1, Math.round(bytes / 1024))} ${T('KB', 'Ko')}`

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

// Réduit une grande image (côté le plus long à 1568 px), ou la convertit si son
// format n'est pas accepté par les modèles. Renvoie un Blob.
async function prepareImage(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    if (IMAGE_TYPES.includes(file.type)) return file
    throw new Error(T('this image cannot be read', 'image illisible'))
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  const keep = IMAGE_TYPES.includes(file.type) && scale === 1 && file.size <= MAX_IMAGE_BYTES
  if (keep || (file.type === 'image/gif' && file.size <= MAX_IMAGE_BYTES)) {
    bitmap.close?.()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, 0.9))
}

export function createChatPanel({ mode, chatUrl, bridge, tools }) {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const panel = document.createElement('aside')
  panel.id = 'chat-panel'
  panel.innerHTML = `
    <header><span>${T('AI assistant', 'Assistant IA')}</span><button class="btn" type="button" id="chat-settings" title="${T('Providers, keys and models', 'Fournisseurs, clés et modèles')}">Options</button><button class="btn" type="button" id="chat-reset">${T('New chat', 'Nouvelle discussion')}</button></header>
    <div id="chat-log" aria-live="polite"></div>
    <div id="chat-options" hidden>
      <span id="chat-model-name"></span>
    </div>
    <div id="chat-attachments" hidden></div>
    <form id="chat-form">
      <div class="chat-input-wrap">
        <textarea id="chat-input" placeholder="${T('Describe the process to draw, or what to change…', 'Décrivez le processus à dessiner, ou ce qu\'il faut changer…')}"></textarea>
        <button type="button" id="chat-expand" title="${T('Expand the input', 'Agrandir la zone de saisie')}" aria-label="${T('Expand the input', 'Agrandir la zone de saisie')}">${EXPAND_ICON}</button>
        <button type="button" id="chat-attach" title="${T('Attach an image or a PDF (you can also paste or drop it)', 'Joindre une image ou un PDF (on peut aussi le coller ou le glisser)')}" aria-label="${T('Attach an image or a PDF', 'Joindre une image ou un PDF')}">${ATTACH_ICON}</button>
        <input type="file" id="chat-attach-input" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" multiple hidden>
      </div>
      <button class="btn primary" type="submit" id="chat-send">${T('Send', 'Envoyer')}</button>
    </form>
    <dialog id="chat-editor">
      <form method="dialog">
        <h2>${T('Message to the assistant', "Message à l'assistant")}</h2>
        <textarea id="chat-editor-text" placeholder="${T('Paste or write a long message. Ctrl+Enter to send.', 'Collez ou écrivez un long message. Ctrl+Entrée pour envoyer.')}"></textarea>
        <div class="chat-editor-actions">
          <button class="btn" type="button" id="chat-editor-file">${T('Open a text file…', 'Ouvrir un fichier texte…')}</button>
          <input type="file" id="chat-editor-input" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden>
          <span class="chat-editor-count" aria-live="polite"></span>
          <button class="btn" type="submit" value="close">${T('Close', 'Fermer')}</button>
          <button class="btn primary" type="submit" value="send" id="chat-editor-send">${T('Send', 'Envoyer')}</button>
        </div>
      </form>
    </dialog>`
  document.getElementById('properties-panel').after(panel)
  makeResizable(panel, { name: 'chat', label: T('AI assistant width', "Largeur de l'assistant IA"), min: 300, max: 900, fallback: 360 })

  const toggle = document.createElement('button')
  toggle.className = 'btn'
  toggle.id = 'btn-chat'
  toggle.type = 'button'
  toggle.textContent = T('AI assistant', 'Assistant IA')
  // À droite de la barre, juste après le badge MCP (version docker), ou en tête
  // du groupe de droite quand il n'y a pas de badge (version en ligne).
  const badge = document.getElementById('mcp-status')
  const autosave = document.getElementById('autosave-status')
  if (badge) badge.after(toggle)
  else if (autosave) {
    autosave.before(toggle)
    toggle.classList.add('push-right')
    autosave.style.marginLeft = '8px'
  } else document.getElementById('btn-simulation').after(toggle)

  const log = panel.querySelector('#chat-log')
  const form = panel.querySelector('#chat-form')
  const input = panel.querySelector('#chat-input')
  const sendButton = panel.querySelector('#chat-send')
  const modelBar = panel.querySelector('#chat-options')
  const modelName = panel.querySelector('#chat-model-name')

  let controller = null // requête en cours, pour le bouton « Arrêter »
  let checked = false
  let settings = loadSettings()
  let serverModels = [] // { id, label, provider, providerLabel }, envoyés par le serveur
  let models = [] // serverModels puis modèles de la fenêtre Options
  let currentId = '' // modèle de l'assistant, choisi dans la fenêtre Options
  // Discussion en cours : sur le serveur ({ id }) ou dans la page ({ messages }).
  // kind « server:anthropic », « local:openai »… : l'historique ne passe pas d'un format à l'autre.
  let conversation = null

  const currentModel = () => models.find((m) => m.id === currentId)
  const kindOf = (m) => `${mode === 'online' ? 'local' : 'server'}:${m.source === 'user' ? m.format : m.provider}`

  const options = createOptionsDialog({
    mode,
    test: testConnection,
    onSave(saved) {
      settings = saved
      const before = currentModel()
      fillModels()
      const model = currentModel()
      // Un historique ne passe pas d'un format d'API à l'autre.
      if (conversation && model && before?.id !== model.id) {
        if (conversation.kind !== kindOf(model)) {
          conversation = null
          add('notice', T(`Different provider: the chat starts over with ${model.label}. The diagram does not change.`, `Autre fournisseur : la discussion repart de zéro avec ${model.label}. Le diagramme, lui, ne change pas.`))
        } else {
          add('notice', T(`The next messages will go to ${model.label}.`, `Les prochains messages iront à ${model.label}.`))
        }
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
        throw new Error(describeProviderError(err, { label: conn.label, providerId: conn.provider, browser: true, origin: location.origin, lang }))
      }
    }
    let res
    try {
      res = await fetch(`${chatUrl}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...conn, lang }),
      })
    } catch {
      throw new Error(T('Server unreachable. Start it with: cd mcp && npm start', 'Serveur injoignable. Lancez-le avec : cd mcp && npm start'))
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) throw new Error(data.error || T(`the server answered ${res.status}`, `le serveur a répondu ${res.status}`))
    return data.models
  }

  // Modèles disponibles : ceux du serveur, puis ceux des fournisseurs testés dans
  // Options. Le modèle de l'assistant se choisit dans Options ; le panneau l'affiche.
  function fillModels() {
    models = [...serverModels.map((m) => ({ ...m, source: 'server' })), ...userModels(settings)]
    const has = (id) => id && models.some((m) => m.id === id)
    currentId = has(settings.defaultModel) ? settings.defaultModel : has(serverDefault) ? serverDefault : models[0]?.id || ''
    const model = currentModel()
    modelName.textContent = model ? T(`Model: ${model.label}`, `Modèle : ${model.label}`) + (model.providerLabel ? ` (${model.providerLabel})` : '') : ''
    modelName.title = T('Change it in Options', 'À changer dans Options')
    modelBar.hidden = !model
  }
  let serverDefault = null

  // Message d'accueil, ou marche à suivre si aucun modèle n'est disponible.
  function announce() {
    if (!models.length) {
      add(
        'notice',
        mode === 'online'
          ? T('To start, open Options and turn on a provider: Anthropic, OpenAI, Ollama or an OpenAI-compatible server.', 'Pour commencer, ouvrez Options et activez un fournisseur : Anthropic, OpenAI, Ollama ou un serveur compatible OpenAI.')
          : T('Chat is not set up: open Options to set up a provider, or add ANTHROPIC_API_KEY or OPENAI_MODELS to mcp/.env and restart the server.', "Le chat n'est pas configuré : ouvrez Options pour régler un fournisseur, ou ajoutez ANTHROPIC_API_KEY ou OPENAI_MODELS dans mcp/.env puis relancez le serveur."),
      )
    } else if (!log.querySelector('.chat-msg:not(.notice)') && !log.querySelector('.welcome')) {
      add('notice', T('Describe a process and I will draw it on the canvas. Changes can be undone with Ctrl+Z, except the automatic layout.', `Décrivez un processus et je le dessine sur le canevas. Les modifications s'annulent avec Ctrl+Z, sauf la mise en page automatique.`)).classList.add('welcome')
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
    sendButton.textContent = busy ? T('Stop', 'Arrêter') : T('Send', 'Envoyer')
    input.disabled = busy
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
      add('notice', T('Server unreachable. Start it with: cd mcp && npm start', 'Serveur injoignable. Lancez-le avec : cd mcp && npm start'))
    }
  }

  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('open')
    toggle.classList.toggle('active', open)
    if (open) {
      trackOnce('assistant-ouvert')
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
    editorCount.textContent = n
      ? T(`${num(n)} character${n > 1 ? 's' : ''}`, `${num(n)} caractère${n > 1 ? 's' : ''}`) +
        (n > MAX_MESSAGE ? T(`: too long, ${num(MAX_MESSAGE)} at most`, ` : trop long, ${num(MAX_MESSAGE)} au plus`) : '')
      : ''
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
      editorCount.textContent = T('File too large.', 'Fichier trop volumineux.')
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

  // ── Pièces jointes : images et PDF, joints, collés ou glissés ─────────────
  let pending = [] // { kind, mediaType, name, data, size, url }
  const attachBox = panel.querySelector('#chat-attachments')
  const attachInput = panel.querySelector('#chat-attach-input')

  function attachmentChip(a, onRemove) {
    const chip = document.createElement('div')
    chip.className = 'chat-file'
    chip.title = `${a.name} (${sizeText(a.size)})`
    if (a.kind === 'image') {
      const img = document.createElement('img')
      img.src = a.url
      img.alt = ''
      chip.append(img)
    } else {
      const icon = document.createElement('span')
      icon.className = 'chat-file-pdf'
      icon.innerHTML = PDF_ICON
      chip.append(icon)
    }
    const label = document.createElement('span')
    label.className = 'chat-file-name'
    label.textContent = a.name
    chip.append(label)
    if (onRemove) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'chat-file-remove'
      remove.textContent = '×'
      remove.title = T('Remove', 'Retirer')
      remove.setAttribute('aria-label', T(`Remove ${a.name}`, `Retirer ${a.name}`))
      remove.addEventListener('click', onRemove)
      chip.append(remove)
    }
    return chip
  }

  function renderAttachments() {
    attachBox.replaceChildren(
      ...pending.map((a, i) =>
        attachmentChip(a, () => {
          pending.splice(i, 1)
          renderAttachments()
          input.focus()
        }),
      ),
    )
    attachBox.hidden = !pending.length
  }

  async function addFiles(files) {
    for (const file of files) {
      const isPdf = file.type === PDF_TYPE || /\.pdf$/i.test(file.name)
      const isImage = file.type.startsWith('image/')
      const name = file.name || (isPdf ? 'document.pdf' : T('pasted image', 'image collée'))
      if (!isPdf && !isImage) {
        add('error', T(`${name}: only images (PNG, JPEG, GIF, WebP) and PDF files can be attached.`, `${name} : seules les images (PNG, JPEG, GIF, WebP) et les PDF peuvent être joints.`))
        continue
      }
      if (pending.length >= MAX_ATTACHMENTS) {
        add('error', T(`${MAX_ATTACHMENTS} files at most per message.`, `${MAX_ATTACHMENTS} fichiers au plus par message.`))
        break
      }
      try {
        const blob = isPdf ? file : await prepareImage(file)
        const max = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
        if (blob.size > max) {
          add('error', T(`${name} is too large: ${sizeText(max)} at most.`, `${name} est trop volumineux : ${sizeText(max)} au plus.`))
          continue
        }
        const total = pending.reduce((n, a) => n + a.size, 0) + blob.size
        if (total > MAX_TOTAL_BYTES) {
          add('error', T(`Attached files: ${sizeText(MAX_TOTAL_BYTES)} at most per message.`, `Fichiers joints : ${sizeText(MAX_TOTAL_BYTES)} au plus par message.`))
          continue
        }
        pending.push({
          kind: isPdf ? 'pdf' : 'image',
          mediaType: isPdf ? PDF_TYPE : blob.type,
          name,
          data: await blobToBase64(blob),
          size: blob.size,
          url: isPdf ? null : URL.createObjectURL(blob),
        })
      } catch (err) {
        add('error', T(`${name}: ${err.message}`, `${name} : ${err.message}`))
      }
    }
    renderAttachments()
  }

  panel.querySelector('#chat-attach').addEventListener('click', () => attachInput.click())
  attachInput.addEventListener('change', () => {
    const files = [...attachInput.files]
    attachInput.value = ''
    addFiles(files).then(() => input.focus())
  })
  // Coller une image (capture d'écran…) ou un fichier dans la zone de saisie.
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])]
    if (!files.length) return
    e.preventDefault()
    addFiles(files)
  })
  // Glisser sur le panneau : le fichier est joint au message, il n'ouvre pas de diagramme.
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')
  for (const type of ['dragenter', 'dragover']) {
    panel.addEventListener(type, (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      document.body.classList.remove('drop-target')
      panel.classList.add('drop-files')
    })
  }
  panel.addEventListener('dragleave', (e) => {
    if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop-files')
  })
  panel.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    panel.classList.remove('drop-files')
    addFiles([...e.dataTransfer.files])
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
    let text = input.value.trim()
    if (!text && !pending.length) return
    if (!text) text = T('Draw the process shown in the attached file.', 'Dessine le processus du fichier joint.')
    if (text.length > MAX_MESSAGE) {
      add('error', T(`Message too long: ${num(MAX_MESSAGE)} characters at most.`, `Message trop long : ${num(MAX_MESSAGE)} caractères au plus.`))
      return
    }
    if (!currentModel()) {
      add('error', T('No model available: open Options to set up a provider.', 'Aucun modèle disponible : ouvrez Options pour régler un fournisseur.'))
      return
    }
    if (mode !== 'online' && !bridge.tabId) {
      add('error', T('The editor is not connected to the server (MCP badge offline).', "L'éditeur n'est pas relié au serveur (badge MCP hors ligne)."))
      return
    }
    const attachments = pending.slice()
    const model = currentModel()
    const caps = model.source === 'user' ? { format: model.format, providerId: model.providerId } : { format: model.provider === 'openai' ? 'openai' : 'anthropic', providerId: model.provider }
    if (attachments.some((a) => !supports(caps, a.kind))) {
      add('error', T(`${model.providerLabel || model.label} cannot read PDF files. Use an Anthropic or OpenAI model, or paste the text of the document.`,
        `${model.providerLabel || model.label} ne sait pas lire les PDF. Utilisez un modèle Anthropic ou OpenAI, ou collez le texte du document.`))
      return
    }
    input.value = ''
    fitInput()
    pending = []
    renderAttachments()
    send(text, attachments)
  })

  async function send(text, attachments = []) {
    trackOnce('assistant-utilise')
    // Chaque réponse ne marque que ce qu'elle a changé.
    newAiRound()
    const userMsg = add('user', text)
    if (attachments.length) {
      const strip = document.createElement('div')
      strip.className = 'chat-msg-files'
      for (const a of attachments) strip.append(attachmentChip(a))
      userMsg.prepend(strip)
    }
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
      if (event.type === 'text') statusText = T('writing', 'rédige')
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
        if (event.phase === 'thinking') statusText = T('thinking', 'réflexion')
        else if (event.phase === 'preparing')
          statusText = T(`preparing: ${label}`, `prépare : ${label}`) + (event.size ? ` (${(event.size / 1024).toFixed(1)} ${T('KB', 'Ko')})` : '')
        else if (event.phase === 'running') statusText = T(`running: ${label}`, `exécute : ${label}`)
        renderStatus()
      } else if (event.type === 'error') {
        failed = true
        add('error', event.message)
      }
      log.scrollTop = log.scrollHeight
    }

    const conn = model.source === 'user' ? connectionFor(model, settings) : null
    try {
      const payload = attachments.map(({ kind, mediaType, name, data }) => ({ kind, mediaType, name, data }))
      if (mode === 'online') await sendLocal({ conn, model, text, attachments: payload, handle, signal: controller.signal })
      else await sendServer({ conn, model, text, attachments: payload, handle, signal: controller.signal })
    } catch (err) {
      failed = true
      if (controller.signal.aborted) add('notice', T('Reply stopped.', 'Réponse interrompue.'))
      else if (conn && mode === 'online') add('error', describeProviderError(err, { label: conn.label, providerId: conn.provider, browser: true, origin: location.origin, lang }))
      else add('error', T(`Sending failed: ${err.message}`, `Échec de l'envoi : ${err.message}`))
    } finally {
      clearInterval(timer)
      status.remove()
      if (!gotText) reply.remove()
      if (failed && attachments.length && !controller.signal.aborted && kindOf(model).endsWith(':openai'))
        add('notice', T('If the error is about the attached files, this model may not read images or PDF files: try another model.', "Si l'erreur porte sur les fichiers joints, ce modèle ne sait peut-être pas lire les images ou les PDF : essayez un autre modèle."))
      if (!gotText && !failed) add('notice', T('The model gave no answer. Check that it supports tool calls, or try another model.', "Le modèle n'a rien répondu. Vérifiez qu'il sait appeler des outils, ou essayez un autre modèle."))
      controller = null
      setBusy(false)
      input.focus()
    }
  }

  // Version docker : le serveur fait la boucle et renvoie un flux SSE.
  async function sendServer({ conn, model, text, attachments, handle, signal }) {
    const body = { conversationId: conversation?.id, tabId: bridge.tabId, text, lang, ...(attachments.length ? { attachments } : {}) }
    if (conn) body.custom = conn
    else body.model = model.id
    // Type propre au chat : le serveur le lit avec une limite assez grande pour les pièces jointes.
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.bpmn-chat+json' },
      body: JSON.stringify(body),
      signal,
    })
    if (res.status === 413) throw new Error(T('the attached files are too large for the server', 'les fichiers joints sont trop volumineux pour le serveur'))
    if (!res.ok) throw new Error(T(`the server answered ${res.status}`, `le serveur a répondu ${res.status}`))
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
  async function sendLocal({ conn, model, text, attachments, handle, signal }) {
    const engine = await loadEngine()
    const kind = kindOf(model)
    if (!conversation || conversation.kind !== kind || !conversation.messages) conversation = { kind, messages: [] }
    const conv = conversation
    const common = {
      model: conn.model,
      conv,
      text,
      attachments,
      toolSet: engine.toolSet,
      executeTool: async (name, args) => {
        const tool = tools[name]
        if (!tool) throw new Error(`Unknown tool: ${name}`)
        return tool(args)
      },
      emit: handle,
      signal,
      log: (...args) => console.warn(...args),
      lang,
    }
    if (conn.format === 'anthropic') {
      // Le SDK 1.12 enverrait la clé dans « Authorization: Bearer », que l'API refuse
      // dans certains cas (« x-api-key header is required ») : on la passe en x-api-key.
      const client = new engine.Anthropic({ apiKey: null, authToken: null, baseURL: conn.baseUrl, dangerouslyAllowBrowser: true, ...(conn.apiKey ? { defaultHeaders: { 'x-api-key': conn.apiKey } } : {}) })
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
