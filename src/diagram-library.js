// « Mes diagrammes » : plusieurs diagrammes enregistrés, à rouvrir, renommer ou
// supprimer. Dans le navigateur (IndexedDB) pour les deux versions, et sur le
// serveur (dossier monté en volume) dans la version docker.
//
// Le diagramme ouvert peut être lié à un diagramme enregistré : « Enregistrer »
// (ou Ctrl+S) met alors ce dernier à jour. Le lien est retenu par le navigateur.
//
// En mode Expert, avec les tables de décision allumées, la liste montre aussi les modèles de
// décision (.dmn, kind 'dmn') : ils s'ouvrent dans la fenêtre DMN (src/dmn/decision-editor.js).

import { lang, T } from './i18n/lang.js'
import { addDialogClose } from './dialog-close.js'

const LINK_KEY = 'bpmn-editor-library-link'
// Le diagramme ouvert n'est plus lié à un enregistrement (Nouveau, fichier, autre diagramme).
export const UNLINKED_EVENT = 'bpmn-pilot-library-unlinked'
const PLACES = {
  browser: () => T('This browser', 'Ce navigateur'),
  server: () => T('Server', 'Serveur'),
}

// ── Stockage dans le navigateur ─────────────────────────────────────────────

function browserStore() {
  let dbPromise = null
  const open = () => {
    dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('bpmn-editor-library', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('diagrams', { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => { dbPromise = null })
    return dbPromise
  }
  const run = async (mode, fn) => {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('diagrams', mode)
      const req = fn(tx.objectStore('diagrams'))
      tx.oncomplete = () => resolve(req?.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }
  return {
    place: 'browser',
    async list() {
      const all = (await run('readonly', (s) => s.getAll())) || []
      return all.map(({ id, name, kind, updatedAt, size }) => ({ id, name, kind: kind || 'bpmn', updatedAt, size }))
    },
    get: (id) => run('readonly', (s) => s.get(id)),
    async put(id, name, xml, kind = 'bpmn') {
      const item = { id, name, kind, xml, updatedAt: new Date().toISOString(), size: new Blob([xml]).size }
      await run('readwrite', (s) => s.put(item))
      return item
    },
    async rename(id, name) {
      const item = await run('readonly', (s) => s.get(id))
      if (!item) return null
      item.name = name
      item.updatedAt = new Date().toISOString()
      await run('readwrite', (s) => s.put(item))
      return item
    },
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  }
}

// ── Stockage sur le serveur (version docker, ou développement avec le serveur mcp/) ──

function serverStore(baseUrl) {
  const call = async (path, init) => {
    const res = await fetch(baseUrl + path, init)
    if (res.status === 404 && init?.method !== 'DELETE') return null
    if (res.status === 413) throw new Error(T('diagram too large for the server', 'diagramme trop volumineux pour le serveur'))
    if (!res.ok) {
      // Le serveur dit la cause (dossier sans droit d'écriture, adresse non autorisée…).
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || T(`the server answered ${res.status}`, `le serveur a répondu ${res.status}`))
    }
    return res.json()
  }
  return {
    place: 'server',
    async list() {
      const data = await call('')
      return data?.diagrams || []
    },
    get: (id) => call('/' + id),
    put: (id, name, xml, kind = 'bpmn') =>
      call(`/${id}?name=${encodeURIComponent(name)}${kind === 'dmn' ? '&kind=dmn' : ''}`, { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: xml }),
    rename: (id, name) =>
      call('/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
    remove: (id) => call('/' + id, { method: 'DELETE' }),
  }
}

// ── Fenêtre ─────────────────────────────────────────────────────────────────

const newId = () =>
  (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).toLowerCase()

const formatDate = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function readLink() {
  try {
    const link = JSON.parse(localStorage.getItem(LINK_KEY) || 'null')
    if (link && PLACES[link.place] && typeof link.id === 'string') return link
  } catch {}
  return null
}

function writeLink(link) {
  try {
    if (link) localStorage.setItem(LINK_KEY, JSON.stringify(link))
    else localStorage.removeItem(LINK_KEY)
  } catch {}
}

// button : bouton qui ouvre la fenêtre. getXml() renvoie le XML du diagramme ouvert,
// getName() et setName(name) lisent et changent le nom du fichier, openXml(xml, name)
// ouvre un diagramme (renvoie un message d'erreur ou rien), setStatus(msg) écrit dans
// la barre d'outils, isDirty()/markClean() suivent les modifications non enregistrées.
// serverUrl : adresse de la route /diagrams du serveur, ou rien.
// openDecisionModel(item) : ouvre un modèle de décision enregistré ({ id, place, name, xml }).
export function setupDiagramLibrary({ button, getXml, getName, setName, openXml, setStatus, isDirty, markClean, serverUrl, openDecisionModel }) {
  const stores = { browser: browserStore() }
  if (serverUrl) stores.server = serverStore(serverUrl)
  let serverOk = false
  let link = readLink()
  if (link && !stores[link.place]) link = null

  const dialog = document.createElement('dialog')
  dialog.id = 'library-dialog'
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('My diagrams', 'Mes diagrammes')}</h2>
      <p class="hint" id="library-hint"></p>
      <div class="library-save">
        <label class="field">${T('Name', 'Nom')}
          <input type="text" id="library-name" maxlength="120" spellcheck="false" autocomplete="off" />
        </label>
        <div class="field" id="library-place-field">${T('Save to', 'Enregistrer dans')}
          <div class="library-places" role="radiogroup">
            <label><input type="radio" name="library-place" value="browser" checked /> ${PLACES.browser()}</label>
            <label><input type="radio" name="library-place" value="server" /> ${PLACES.server()}</label>
          </div>
        </div>
      </div>
      <p class="library-link" id="library-link"></p>
      <div class="actions">
        <button type="button" class="btn primary" data-icon="save" id="library-save" title="${T('Update the open entry, or create it (Ctrl+S)', 'Mettre à jour l\'enregistrement ouvert, ou le créer (Ctrl+S)')}">${T('Save', 'Enregistrer')}</button>
        <button type="button" class="btn" id="library-save-new" title="${T('Save a separate copy under the name above', 'Enregistrer une copie distincte sous le nom ci-dessus')}">${T('Save as new', 'Enregistrer comme nouveau')}</button>
      </div>
      <p class="status" id="library-status" role="status"></p>
      <div class="library-list" id="library-list"></div>
      <div class="actions">
        <span class="grow"></span>
        <button type="submit" class="btn" value="close">${T('Close', 'Fermer')}</button>
      </div>
    </form>`
  addDialogClose(dialog)
  document.body.appendChild(dialog)

  const $ = (sel) => dialog.querySelector(sel)
  const nameField = $('#library-name')
  const status = $('#library-status')
  const listEl = $('#library-list')
  const saveButton = $('#library-save')
  const saveNewButton = $('#library-save-new')
  const placeRadios = [...dialog.querySelectorAll('input[name="library-place"]')]
  let rows = []

  const say = (msg, error = false) => {
    status.textContent = msg
    status.classList.toggle('error', error)
  }
  const chosenPlace = () => placeRadios.find((r) => r.checked)?.value || 'browser'
  const linkedRow = () => link && rows.find((r) => r.place === link.place && r.id === link.id)

  function renderHeader() {
    $('#library-hint').textContent = stores.server
      ? T('Diagrams saved in your browser stay on your device. Diagrams saved on the server can be opened from any browser that reaches it.',
          'Les diagrammes enregistrés dans votre navigateur restent sur votre appareil. Ceux enregistrés sur le serveur s\'ouvrent depuis n\'importe quel navigateur qui y accède.')
      : T('Diagrams are saved in your browser, on your device only. Export a .bpmn file to keep a copy elsewhere.',
          'Les diagrammes sont enregistrés dans votre navigateur, sur votre appareil seulement. Exportez un fichier .bpmn pour en garder une copie ailleurs.')
    $('#library-place-field').hidden = !stores.server
    const serverRadio = placeRadios.find((r) => r.value === 'server')
    serverRadio.disabled = !serverOk
    serverRadio.parentElement.title = serverOk ? '' : T('Server unreachable', 'Serveur injoignable')
    if (!serverOk && serverRadio.checked) placeRadios[0].checked = true

    const linked = linkedRow()
    if (linked) {
      $('#library-link').textContent = T(
        `“Save” updates “${linked.name}” (${PLACES[linked.place]()}).`,
        `« Enregistrer » met à jour « ${linked.name} » (${PLACES[linked.place]()}).`,
      )
      saveNewButton.hidden = false
    } else {
      $('#library-link').textContent = ''
      saveNewButton.hidden = true
    }
  }

  async function refresh() {
    const found = []
    let serverError = null
    for (const store of Object.values(stores)) {
      try {
        for (const item of await store.list()) found.push({ ...item, place: store.place })
        if (store.place === 'server') serverOk = true
      } catch (err) {
        if (store.place === 'server') {
          serverOk = false
          serverError = err
        } else {
          say(T(`Browser storage unavailable: ${err?.message || err}`, `Stockage du navigateur indisponible : ${err?.message || err}`), true)
        }
      }
    }
    rows = found.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    if (link && !linkedRow() && (link.place !== 'server' || serverOk)) {
      link = null
      writeLink(null)
    }
    renderHeader()
    renderList(serverError)
  }

  function renderList(serverError) {
    listEl.replaceChildren()
    if (serverError) {
      const p = document.createElement('p')
      p.className = 'hint'
      p.textContent = serverError.message && !/fetch|network/i.test(serverError.message)
        ? T(`The server cannot list its diagrams: ${serverError.message} Only the diagrams of your browser are listed.`,
            `Le serveur ne peut pas lister ses diagrammes : ${serverError.message} Seuls les diagrammes de votre navigateur sont listés.`)
        : T('The server could not be reached: only the diagrams of your browser are listed.', 'Le serveur est injoignable : seuls les diagrammes de votre navigateur sont listés.')
      listEl.append(p)
    }
    if (!rows.length) {
      const p = document.createElement('p')
      p.className = 'library-empty'
      p.textContent = T('No saved diagram yet.', 'Aucun diagramme enregistré pour l\'instant.')
      listEl.append(p)
      return
    }
    const table = document.createElement('table')
    table.innerHTML = `<thead><tr><th>${T('Name', 'Nom')}</th>${stores.server ? `<th>${T('Where', 'Où')}</th>` : ''}<th>${T('Modified', 'Modifié')}</th><th><span class="sr-only">${T('Actions', 'Actions')}</span></th></tr></thead>`
    const body = document.createElement('tbody')
    for (const row of rows) {
      const tr = document.createElement('tr')
      if (link && row.place === link.place && row.id === link.id) tr.className = 'current'
      if (row.kind === 'dmn') tr.className = 'dmn-only expert-only'
      const nameCell = document.createElement('td')
      nameCell.className = 'name'
      nameCell.textContent = row.name
      if (row.kind === 'dmn') {
        const tag = document.createElement('span')
        tag.className = 'library-kind'
        tag.textContent = 'DMN'
        tag.title = T('Decision model', 'Modèle de décision')
        nameCell.append(' ', tag)
      }
      tr.append(nameCell)
      if (stores.server) {
        const where = document.createElement('td')
        where.className = 'where'
        where.textContent = PLACES[row.place]()
        tr.append(where)
      }
      const date = document.createElement('td')
      date.className = 'date'
      date.textContent = formatDate(row.updatedAt)
      tr.append(date)
      const actions = document.createElement('td')
      actions.className = 'row-actions'
      const unreachable = row.place === 'server' && !serverOk
      actions.append(
        rowButton(T('Open', 'Ouvrir'), () => openRow(row), unreachable),
        rowButton(T('Rename', 'Renommer'), () => startRename(row, nameCell), unreachable),
        rowButton(T('Delete', 'Supprimer'), () => removeRow(row), unreachable, 'danger'),
      )
      tr.append(actions)
      body.append(tr)
    }
    table.append(body)
    listEl.append(table)
  }

  function rowButton(label, onClick, disabled, variant) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = variant ? `btn ${variant}` : 'btn'
    b.textContent = label
    b.disabled = disabled
    b.addEventListener('click', onClick)
    return b
  }

  const cleanName = (value) => value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120)

  async function save({ asNew = false, quiet = false } = {}) {
    const name = cleanName(quiet ? getName() : nameField.value) || getName()
    const target = !asNew && link ? link : { place: chosenPlace(), id: newId() }
    const store = stores[target.place]
    try {
      const xml = await getXml()
      await store.put(target.id, name, xml)
      link = target
      writeLink(link)
      if (name !== getName()) setName(name)
      markClean()
      const msg = T(`Saved: “${name}” (${PLACES[target.place]()})`, `Enregistré : « ${name} » (${PLACES[target.place]()})`)
      setStatus(msg)
      if (!quiet) {
        say(msg)
        await refresh()
      }
      return true
    } catch (err) {
      const msg = T(`Save failed: ${err?.message || err}`, `Échec de l'enregistrement : ${err?.message || err}`)
      if (quiet) setStatus(msg)
      else say(msg, true)
      return false
    }
  }

  async function openRow(row) {
    if (row.kind === 'dmn') return openDecisionRow(row)
    if (isDirty() && !confirm(T('The current diagram has changes that are not saved in My diagrams. Open the other one anyway?', 'Le diagramme actuel a des modifications non enregistrées dans Mes diagrammes. Ouvrir l\'autre quand même ?'))) return false
    say('')
    try {
      const item = await stores[row.place].get(row.id)
      if (!item) {
        say(T('This diagram no longer exists.', 'Ce diagramme n\'existe plus.'), true)
        return refresh()
      }
      const failure = await openXml(item.xml, item.name)
      if (failure) return say(T(`Cannot open it: ${failure}`, `Ouverture impossible : ${failure}`), true)
      link = { place: row.place, id: row.id }
      writeLink(link)
      markClean()
      setStatus(T(`Opened: “${item.name}”`, `Ouvert : « ${item.name} »`))
      dialog.close()
      return true
    } catch (err) {
      say(T(`Cannot open it: ${err?.message || err}`, `Ouverture impossible : ${err?.message || err}`), true)
      return false
    }
  }

  // Modèle de décision : il s'ouvre dans sa propre fenêtre, le diagramme ouvert ne change pas.
  async function openDecisionRow(row) {
    say('')
    try {
      const item = await stores[row.place].get(row.id)
      if (!item) {
        say(T('This decision model no longer exists.', 'Ce modèle de décision n\'existe plus.'), true)
        return refresh()
      }
      dialog.close()
      openDecisionModel?.({ ...item, id: row.id, place: row.place })
    } catch (err) {
      say(T(`Cannot open it: ${err?.message || err}`, `Ouverture impossible : ${err?.message || err}`), true)
    }
  }

  function startRename(row, cell) {
    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 120
    input.value = row.name
    input.setAttribute('aria-label', T('New name', 'Nouveau nom'))
    cell.replaceChildren(input)
    input.focus()
    input.select()
    let done = false
    const finish = async (keep) => {
      if (done) return
      done = true
      const name = cleanName(input.value)
      if (!keep || !name || name === row.name) return refresh()
      try {
        await stores[row.place].rename(row.id, name)
        if (row.kind !== 'dmn' && link && link.place === row.place && link.id === row.id) setName(name)
        say(T(`Renamed: “${name}”`, `Renommé : « ${name} »`))
      } catch (err) {
        say(T(`Rename failed: ${err?.message || err}`, `Échec du renommage : ${err?.message || err}`), true)
      }
      refresh()
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true) }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false) }
    })
    input.addEventListener('blur', () => finish(true))
  }

  async function removeRow(row) {
    if (!confirm(T(`Delete “${row.name}” from My diagrams? This cannot be undone.`, `Supprimer « ${row.name} » de Mes diagrammes ? C'est définitif.`))) return
    try {
      await stores[row.place].remove(row.id)
      if (link && link.place === row.place && link.id === row.id) {
        link = null
        writeLink(null)
      }
      say(T(`Deleted: “${row.name}”`, `Supprimé : « ${row.name} »`))
    } catch (err) {
      say(T(`Delete failed: ${err?.message || err}`, `Échec de la suppression : ${err?.message || err}`), true)
    }
    refresh()
  }

  async function show() {
    say('')
    nameField.value = getName()
    rows = []
    await refresh()
    if (!dialog.open) dialog.showModal()
    nameField.focus()
    nameField.select()
  }

  button.addEventListener('click', show)
  saveButton.addEventListener('click', () => save())
  saveNewButton.addEventListener('click', () => save({ asNew: true }))
  nameField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save() }
  })

  // Ctrl+S : met à jour le diagramme lié, ou ouvre la fenêtre pour choisir.
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (dialog.open) save()
      else if (link) save({ quiet: true })
      else show()
    }
  })

  return {
    // Ouvre un diagramme enregistré sur le serveur (bannière du mode sans navigateur).
    // Renvoie false si l'utilisateur renonce ou si l'ouverture échoue.
    async openServer(id) {
      if (!stores.server) return false
      const opened = await openRow({ place: 'server', id, kind: 'bpmn' })
      if (opened !== true && !dialog.open && status.textContent) dialog.showModal()
      return opened === true
    },
    // Le diagramme ouvert ne correspond plus à un diagramme enregistré
    // (Nouveau, fichier ouvert depuis le disque, XML collé).
    unlink() {
      link = null
      writeLink(null)
      window.dispatchEvent(new CustomEvent(UNLINKED_EVENT))
    },
    // ── Carte à plusieurs niveaux (src/sub-levels.js) ──
    // Enregistrement lié au diagramme ouvert : { place, id, name } ou null.
    async current() {
      if (!link) return null
      try {
        const item = await stores[link.place].get(link.id)
        return item ? { place: link.place, id: link.id, name: item.name } : null
      } catch { return null }
    },
    // Diagrammes BPMN enregistrés, dans tous les lieux joignables : [{ key, place, id, name }].
    async listDiagrams() {
      const found = []
      for (const store of Object.values(stores)) {
        try {
          for (const item of await store.list()) if ((item.kind || 'bpmn') === 'bpmn') found.push({ key: `${store.place}:${item.id}`, place: store.place, id: item.id, name: item.name })
        } catch { /* lieu injoignable */ }
      }
      return found.sort((a, b) => a.name.localeCompare(b.name))
    },
    // Garde le diagramme ouvert dans Mes diagrammes avant d'en ouvrir un autre : met à jour
    // l'enregistrement lié s'il a changé, sinon en crée un. Renvoie la référence, ou null.
    async keepCurrent() {
      if (link && !isDirty()) return { ...link }
      const ok = await save({ quiet: true })
      return ok && link ? { ...link } : null
    },
    // Ouvre un diagramme enregistré sans demander (le diagramme ouvert a été gardé avant).
    async openRef(ref) {
      const store = stores[ref?.place]
      if (!store) throw new Error(T('this place is not available here', 'ce lieu n\'est pas disponible ici'))
      const item = await store.get(ref.id)
      if (!item) throw new Error(T('this diagram no longer exists in My diagrams', 'ce diagramme n\'existe plus dans Mes diagrammes'))
      const failure = await openXml(item.xml, item.name)
      if (failure) throw new Error(failure)
      link = { place: ref.place, id: ref.id }
      writeLink(link)
      markClean()
      return { place: ref.place, id: ref.id, name: item.name }
    },
    // Crée un diagramme dans Mes diagrammes, au même endroit que le diagramme ouvert.
    async createDiagram(name, xml) {
      const place = link?.place && stores[link.place] ? link.place : 'browser'
      const id = newId()
      const clean = cleanName(name || '') || T('Sub-process', 'Sous-processus')
      await stores[place].put(id, clean, xml)
      return { place, id, name: clean }
    },
    // Modèles de décision enregistrés : [{ key, place, id, name }].
    async listDecisionModels() {
      const found = []
      for (const store of Object.values(stores)) {
        try {
          for (const item of await store.list()) if (item.kind === 'dmn') found.push({ key: `${store.place}:${item.id}`, place: store.place, id: item.id, name: item.name })
        } catch { /* lieu injoignable : ses modèles ne sont pas proposés */ }
      }
      return found.sort((a, b) => a.name.localeCompare(b.name))
    },
    getItem: (row) => stores[row.place].get(row.id),
    // Enregistre un modèle de décision : met à jour `ref` ({ place, id }) s'il est donné, sinon en
    // crée un, sur le serveur s'il répond, sinon dans le navigateur. Renvoie { place, id, message }.
    async saveDecisionModel({ ref, name, xml }) {
      let target = ref && stores[ref.place] ? ref : null
      if (!target) {
        let place = 'browser'
        if (stores.server) {
          try { await stores.server.list(); place = 'server' } catch { /* serveur injoignable */ }
        }
        target = { place, id: newId() }
      }
      const clean = cleanName(name || '') || T('Decisions', 'Décisions')
      await stores[target.place].put(target.id, clean, xml, 'dmn')
      return { ...target, message: T(`Saved in My diagrams: “${clean}” (${PLACES[target.place]()})`, `Enregistré dans Mes diagrammes : « ${clean} » (${PLACES[target.place]()})`) }
    },
  }
}
