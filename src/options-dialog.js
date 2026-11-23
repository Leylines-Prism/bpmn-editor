// Fenêtre Options de l'assistant : un bloc par fournisseur (adresse, clé,
// modèles), un bouton Tester, un bouton Lister, et le modèle par défaut.
// Même fenêtre en ligne et en version docker ; seul le texte sur la vie privée change.

import { PROVIDERS } from './ai/providers.js'
import { forgetKeys, providerLabel, saveSettings, userModels } from './ai-settings.js'
import { T } from './i18n/lang.js'

const HINTS = {
  online: {
    anthropic: T('Create a key at console.anthropic.com. Calls go straight from this page to Anthropic.', 'Créez une clé sur console.anthropic.com. Les appels partent directement de cette page vers Anthropic.'),
    openai: T('Create a key at platform.openai.com. OpenAI does not always allow calls made from a web page: if "Test" fails, use the docker version.', "Créez une clé sur platform.openai.com. OpenAI n'autorise pas toujours les appels faits depuis une page : si « Tester » échoue, utilisez la version docker."),
    ollama: T('Ollama must allow this page: start it with OLLAMA_ORIGINS={origin}. Pick a model that supports tool calls.', 'Ollama doit autoriser cette page : lancez-le avec la variable OLLAMA_ORIGINS={origin}. Choisissez un modèle qui sait appeler des outils.'),
    compat: T('LiteLLM, LM Studio, vLLM… The server must allow the origin {origin} (CORS setting). An https page can only call an https address, or localhost.', "LiteLLM, LM Studio, vLLM… Le serveur doit autoriser l'origine {origin} (réglage CORS). Une page en https ne peut appeler qu'une adresse en https, ou localhost."),
  },
  server: {
    anthropic: T('Create a key at console.anthropic.com.', 'Créez une clé sur console.anthropic.com.'),
    openai: T('Create a key at platform.openai.com.', 'Créez une clé sur platform.openai.com.'),
    ollama: T('Address as seen from the server. If it runs in docker, try http://host.docker.internal:11434/v1. Pick a model that supports tool calls.', "Adresse vue depuis le serveur. S'il tourne dans docker, essayez http://host.docker.internal:11434/v1. Choisissez un modèle qui sait appeler des outils."),
    compat: T('LiteLLM, LM Studio, vLLM… Address as seen from the server.', 'LiteLLM, LM Studio, vLLM… Adresse vue depuis le serveur.'),
  },
}

const PRIVACY = {
  online:
    T('Your keys and settings stay in this browser. Your messages and your diagram go straight to the chosen provider, which bills you at its own rates. This site receives neither your keys nor your diagrams.', 'Vos clés et vos réglages restent dans ce navigateur. Vos messages et votre diagramme partent directement chez le fournisseur choisi, qui vous facture selon son tarif. Ce site ne reçoit ni vos clés ni vos diagrammes.'),
  server:
    T('Your keys and settings stay in this browser. With each message, the key goes to your server, which passes it on to the provider without storing it. The provider receives your messages and your diagram, and bills you at its own rates.', "Vos clés et vos réglages restent dans ce navigateur. À chaque message, la clé part vers votre serveur, qui la transmet au fournisseur sans l'enregistrer. Le fournisseur reçoit vos messages et votre diagramme, et vous facture selon son tarif."),
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// mode : « online » ou « server ». serverModels : modèles réglés sur le serveur.
// test(connection) : renvoie la liste des modèles, ou lève une erreur au message lisible.
// onSave(settings) : appelé après l'enregistrement.
export function createOptionsDialog({ mode, test, onSave }) {
  const origin = location.origin
  const dialog = document.createElement('dialog')
  dialog.id = 'options-dialog'
  dialog.setAttribute('aria-labelledby', 'options-title')
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="options-title">${T('Assistant options', "Options de l'assistant")}</h2>
      <p class="hint">${T('Turn on one or more providers, paste the key if needed and test the connection: their models then appear in the menu below, where you pick the model of the assistant.', 'Activez un ou plusieurs fournisseurs, collez la clé si besoin et testez la connexion : leurs modèles apparaissent alors dans le menu du bas, où vous choisissez le modèle de l\'assistant.')}</p>
      <p class="hint" id="options-server" hidden></p>
      <div class="providers">
        ${PROVIDERS.map(
          (p) => `
        <fieldset class="provider" data-id="${p.id}">
          <legend><label><input type="checkbox" class="p-enabled" /> ${esc(p.id === 'compat' ? T('OpenAI-compatible', 'Compatible OpenAI') : p.label)}</label></legend>
          <div class="p-body">
            ${p.customLabel ? `<label class="field"><span>${T('Display name', 'Nom affiché')}</span><input type="text" class="p-label" maxlength="60" placeholder="${T('For example: LiteLLM', 'Par exemple : LiteLLM')}" /></label>` : ''}
            <label class="field"><span>${T('Address', 'Adresse')}</span><input type="url" class="p-url" spellcheck="false" placeholder="${esc(p.baseUrl || 'http://localhost:4000/v1')}" /></label>
            <label class="field"><span>${T('Key', 'Clé')}${p.needsKey ? '' : T(' (optional)', ' (facultative)')}</span><input type="password" class="p-key" spellcheck="false" autocomplete="off" placeholder="${esc(p.keyHint || '')}" /></label>
            <div class="field"><span>${T('Models', 'Modèles')}</span>
              <div class="p-models"></div>
              <div class="p-add-row"><input type="text" class="p-add" spellcheck="false" placeholder="${T('Add a model by its id', 'Ajouter un modèle par son identifiant')}" aria-label="${T('Id of the model to add', 'Identifiant du modèle à ajouter')}" /><button type="button" class="btn p-add-btn">${T('Add', 'Ajouter')}</button></div>
            </div>
            <div class="p-actions">
              <button type="button" class="btn p-test">${T('Test', 'Tester')}</button>
              <button type="button" class="btn p-list">${T('List models', 'Lister les modèles')}</button>
              <span class="p-result" role="status"></span>
            </div>
            <p class="hint p-hint">${esc(HINTS[mode][p.id]).replaceAll('{origin}', esc(origin))}</p>
          </div>
        </fieldset>`,
        ).join('')}
      </div>
      <label class="field default-model"><span>${T('Assistant model', 'Modèle de l\'assistant')}</span><select id="options-default"></select></label>
      <div class="keys-row">
        <label><input type="checkbox" id="options-remember" /> ${T('Remember keys on this device', 'Se souvenir des clés sur cet appareil')}</label>
        <span class="grow"></span>
        <button type="button" class="btn" id="options-forget">${T('Clear keys', 'Effacer les clés')}</button>
      </div>
      <p class="hint privacy">${esc(PRIVACY[mode])} ${T('Without the box above, keys are forgotten when the tab is closed.', "Sans la case ci-dessus, les clés sont oubliées à la fermeture de l'onglet.")}</p>
      <div class="actions">
        <span class="grow"></span>
        <button type="button" class="btn" id="options-cancel">${T('Cancel', 'Annuler')}</button>
        <button type="button" class="btn primary" id="options-save">${T('Save', 'Enregistrer')}</button>
      </div>
    </form>`
  document.body.append(dialog)

  let draft = null
  let serverModels = []
  const blocks = new Map([...dialog.querySelectorAll('.provider')].map((el) => [el.dataset.id, el]))
  const defaultSelect = dialog.querySelector('#options-default')
  const remember = dialog.querySelector('#options-remember')

  const read = (id) => {
    const el = blocks.get(id)
    const s = draft.providers[id]
    s.enabled = el.querySelector('.p-enabled').checked
    s.baseUrl = el.querySelector('.p-url').value.trim()
    s.apiKey = el.querySelector('.p-key').value.trim()
    const label = el.querySelector('.p-label')
    if (label) s.label = label.value.trim()
  }

  function renderModels(id) {
    const box = blocks.get(id).querySelector('.p-models')
    const models = draft.providers[id].models
    box.replaceChildren(
      ...models.map((m, i) => {
        const row = document.createElement('label')
        row.innerHTML = `<input type="checkbox" ${m.on ? 'checked' : ''} /> <span></span>`
        row.querySelector('span').textContent = m.label === m.id ? m.id : `${m.label} (${m.id})`
        row.querySelector('input').addEventListener('change', (e) => {
          models[i].on = e.target.checked
          renderDefault()
        })
        return row
      }),
    )
    if (!models.length) box.textContent = T('No models: "List models" asks the provider for them.', 'Aucun modèle : « Lister les modèles » les demande au fournisseur.')
  }

  function renderDefault() {
    const options = [...serverModels.map((m) => ({ ...m, providerLabel: `${m.providerLabel} ${T('(server)', '(serveur)')}` })), ...userModels(draft)]
    defaultSelect.replaceChildren()
    const groups = new Map()
    for (const m of options) {
      let group = groups.get(m.provider)
      if (!group) {
        group = document.createElement('optgroup')
        group.label = m.providerLabel
        groups.set(m.provider, group)
        defaultSelect.append(group)
      }
      group.append(new Option(m.label, m.id))
    }
    if (!options.length) defaultSelect.append(new Option(T('No model yet: turn on a provider and test its connection', 'Aucun modèle pour l\'instant : activez un fournisseur et testez sa connexion'), ''))
    defaultSelect.value = options.some((m) => m.id === draft.defaultModel) ? draft.defaultModel : options[0]?.id || ''
    defaultSelect.disabled = !options.length
  }

  function renderBlock(id) {
    const el = blocks.get(id)
    const s = draft.providers[id]
    el.querySelector('.p-enabled').checked = s.enabled
    el.querySelector('.p-url').value = s.baseUrl
    el.querySelector('.p-key').value = s.apiKey
    const label = el.querySelector('.p-label')
    if (label) label.value = s.label
    el.classList.toggle('on', s.enabled)
    showStatus(id)
    renderModels(id)
  }

  function connection(id) {
    read(id)
    const s = draft.providers[id]
    const def = PROVIDERS.find((p) => p.id === id)
    return { provider: id, label: providerLabel(id, draft), format: def.format, baseUrl: s.baseUrl, apiKey: s.apiKey || null }
  }

  async function runTest(id, { fill }) {
    const el = blocks.get(id)
    const result = el.querySelector('.p-result')
    const conn = connection(id)
    const def = PROVIDERS.find((p) => p.id === id)
    if (!conn.baseUrl) return showResult(result, false, T('Enter the address first.', "Indiquez d'abord l'adresse."))
    if (def.needsKey && !conn.apiKey) return showResult(result, false, T('Paste the key first.', "Collez d'abord la clé."))
    const buttons = el.querySelectorAll('.p-test, .p-list')
    buttons.forEach((b) => (b.disabled = true))
    showResult(result, null, T('Connecting…', 'Connexion…'))
    try {
      const models = await test(conn)
      draft.providers[id].verified = true
      if (fill) {
        const current = draft.providers[id].models
        const on = new Set(current.filter((m) => m.on).map((m) => m.id))
        // Les modèles cochés restent, même absents de la liste reçue.
        const kept = current.filter((m) => m.on && !models.some((x) => x.id === m.id))
        draft.providers[id].models = [...kept, ...models.map((m) => ({ ...m, on: on.has(m.id) }))]
        renderModels(id)
        showResult(result, true, T(`${models.length} model${models.length > 1 ? 's' : ''} received: tick the ones to offer.`, `${models.length} modèle${models.length > 1 ? 's' : ''} reçu${models.length > 1 ? 's' : ''} : cochez ceux à proposer.`))
      } else {
        showResult(result, true, T(`Connected: ${models.length} model${models.length > 1 ? 's' : ''} available.`, `Connexion réussie : ${models.length} modèle${models.length > 1 ? 's' : ''} disponible${models.length > 1 ? 's' : ''}.`))
      }
      renderDefault()
    } catch (err) {
      draft.providers[id].verified = false
      renderDefault()
      showResult(result, false, err.message)
    } finally {
      buttons.forEach((b) => (b.disabled = false))
    }
  }

  // État d'un bloc activé : connexion déjà testée, ou test à faire avant que ses modèles
  // soient proposés.
  function showStatus(id) {
    const el = blocks.get(id)
    const s = draft.providers[id]
    const result = el.querySelector('.p-result')
    if (!s.enabled) return showResult(result, null, '')
    if (s.verified) showResult(result, true, T('Connection tested.', 'Connexion testée.'))
    else showResult(result, null, T('Test the connection to offer its models.', 'Testez la connexion pour proposer ses modèles.'))
  }

  function showResult(el, ok, text) {
    el.textContent = ok === true ? `✓ ${text}` : ok === false ? `✗ ${text}` : text
    el.className = `p-result${ok === true ? ' ok' : ok === false ? ' failed' : ''}`
  }

  for (const [id, el] of blocks) {
    el.querySelector('.p-enabled').addEventListener('change', (e) => {
      read(id)
      el.classList.toggle('on', e.target.checked)
      showStatus(id)
      renderDefault()
    })
    for (const input of el.querySelectorAll('.p-url, .p-key, .p-label')) {
      input.addEventListener('input', () => {
        read(id)
        // Autre adresse ou autre clé : la connexion est à tester de nouveau.
        if (!input.classList.contains('p-label') && draft.providers[id].verified) {
          draft.providers[id].verified = false
          showStatus(id)
        }
        renderDefault()
      })
    }
    el.querySelector('.p-test').addEventListener('click', () => runTest(id, { fill: false }))
    el.querySelector('.p-list').addEventListener('click', () => runTest(id, { fill: true }))
    const addInput = el.querySelector('.p-add')
    const add = () => {
      const value = addInput.value.trim()
      if (!value) return
      const models = draft.providers[id].models
      const found = models.find((m) => m.id === value)
      if (found) found.on = true
      else models.push({ id: value, label: value, on: true })
      addInput.value = ''
      renderModels(id)
      renderDefault()
    }
    el.querySelector('.p-add-btn').addEventListener('click', add)
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        add()
      }
    })
  }

  defaultSelect.addEventListener('change', () => (draft.defaultModel = defaultSelect.value || null))
  dialog.querySelector('#options-forget').addEventListener('click', () => {
    forgetKeys(draft)
    for (const el of blocks.values()) el.querySelector('.p-key').value = ''
    renderDefault()
  })
  dialog.querySelector('#options-cancel').addEventListener('click', () => dialog.close())
  dialog.querySelector('#options-save').addEventListener('click', () => {
    for (const id of blocks.keys()) read(id)
    draft.remember = remember.checked
    draft.defaultModel = defaultSelect.value || null
    saveSettings(draft)
    dialog.close()
    onSave(draft)
  })

  return {
    open(settings, { server = [] } = {}) {
      draft = structuredClone(settings)
      serverModels = server
      const note = dialog.querySelector('#options-server')
      const groups = [...new Set(server.map((m) => m.providerLabel))]
      note.hidden = !groups.length
      note.textContent = groups.length
        ? T(`Set up on the server: ${groups.map((g) => { const n = server.filter((m) => m.providerLabel === g).length; return `${g} (${n} model${n > 1 ? 's' : ''})` }).join(', ')}. These models are already offered, with no key to enter here.`, `Configuré sur le serveur : ${groups.map((g) => { const n = server.filter((m) => m.providerLabel === g).length; return `${g} (${n} modèle${n > 1 ? 's' : ''})` }).join(', ')}. Ces modèles sont déjà proposés, sans clé à saisir ici.`)
        : ''
      for (const id of blocks.keys()) renderBlock(id)
      remember.checked = draft.remember
      renderDefault()
      dialog.showModal()
    },
  }
}
