// Destination des exports, version docker : en tête du menu Exporter, un choix
// « Téléchargement / Serveur / Les deux ». « Serveur » dépose le fichier dans le dossier exports
// du serveur (route /exports), sous le nom du diagramme. Le choix est retenu par le navigateur.
// « Code XML à copier » et « Imprimer » ne sont pas des fichiers : le choix ne les concerne pas.
// Sans serveur (version en ligne), rien n'est ajouté et les exports se téléchargent.
// Renvoie { deliver, sendToServer } : sendToServer(content, name, ext) dépose un fichier
// et renvoie le nom retenu, ou vaut null sans serveur.

import { T } from './i18n/lang.js'

const KEY = 'bpmn-editor-export-destination'
const MODES = ['download', 'server', 'both']

function readMode() {
  try {
    const value = localStorage.getItem(KEY)
    if (MODES.includes(value)) return value
  } catch {}
  return 'download'
}

// menu : le menu Exporter. exportsUrl : adresse de la route /exports, ou rien.
// download(content, filename, type) : le téléchargement par le navigateur.
// setStatus(message) : la zone d'état de la barre d'outils.
export function setupExportDestination({ menu, exportsUrl, download, setStatus }) {
  if (!exportsUrl) return { deliver: (content, name, ext, type) => download(content, `${name}.${ext}`, type), sendToServer: null }

  let mode = readMode()
  const field = document.createElement('fieldset')
  field.className = 'export-destination'
  field.innerHTML = `
    <legend>${T('Destination', 'Destination')}</legend>
    <div class="export-destination-choices">
      <label><input type="radio" name="export-destination" value="download" /><span>${T('Download', 'Téléchargement')}</span></label>
      <label><input type="radio" name="export-destination" value="server" /><span>${T('Server', 'Serveur')}</span></label>
      <label><input type="radio" name="export-destination" value="both" /><span>${T('Both', 'Les deux')}</span></label>
    </div>`
  field.title = T('Files sent to the server go to the exports folder of the server data folder.',
    'Les fichiers envoyés au serveur vont dans le dossier exports du dossier de données du serveur.')
  for (const radio of field.querySelectorAll('input')) {
    radio.checked = radio.value === mode
    radio.addEventListener('change', () => {
      mode = radio.value
      try { localStorage.setItem(KEY, mode) } catch { /* stockage indisponible : le choix vaut pour cette page */ }
    })
  }
  const sep = document.createElement('div')
  sep.className = 'menu-sep'
  sep.setAttribute('role', 'separator')
  menu.prepend(field, sep)

  async function sendToServer(content, name, ext) {
    const url = `${exportsUrl}?format=${encodeURIComponent(ext)}&name=${encodeURIComponent(name)}`
    let res
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: content instanceof Blob ? content : new Blob([content]) })
    } catch {
      throw new Error(T('the server could not be reached', 'le serveur est injoignable'))
    }
    if (res.status === 413) throw new Error(T('file too large for the server (20 MB at most)', 'fichier trop volumineux pour le serveur (20 Mo au plus)'))
    const data = await res.json().catch(() => ({}))
    if (!res.ok || typeof data.file !== 'string') throw new Error(data.error || T(`the server answered ${res.status}`, `le serveur a répondu ${res.status}`))
    return data.file
  }

  // Livre un export selon le choix : téléchargement, dépôt sur le serveur, ou les deux.
  async function deliver(content, name, ext, type) {
    if (mode !== 'server') download(content, `${name}.${ext}`, type)
    if (mode === 'download') return
    try {
      const file = await sendToServer(content, name, ext)
      setStatus(T(`Saved on the server: exports/${file}`, `Enregistré sur le serveur : exports/${file}`))
    } catch (err) {
      alert(T('Saving on the server failed: ', "Enregistrement sur le serveur impossible : ") + err.message)
    }
  }

  // sendToServer sert aussi à l'outil export_diagram, quel que soit le choix du menu.
  return { deliver, sendToServer }
}
