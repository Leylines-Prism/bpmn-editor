// Bannière « L'IA a exporté … » en bas du canevas, après l'outil export_diagram.
// Le fichier reste en mémoire de la page et ne se télécharge que sur un clic :
// l'IA ne déclenche jamais de téléchargement elle-même. Un nouvel export remplace le précédent.

import { T } from './i18n/lang.js'

// container : le canevas. download(content, filename, type) : le téléchargement du navigateur.
export function createExportOffer({ container, download }) {
  const root = document.createElement('div')
  root.className = 'export-offer'
  root.setAttribute('role', 'status')
  root.hidden = true
  const label = document.createElement('span')
  label.className = 'export-offer-label'
  const dot = document.createElement('span')
  dot.className = 'export-offer-dot'
  const text = document.createElement('span')
  label.append(dot, text)
  const get = document.createElement('button')
  get.type = 'button'
  get.className = 'export-offer-download'
  get.textContent = T('Download', 'Télécharger')
  get.title = T('Save the exported file to your computer', 'Enregistrer le fichier exporté sur votre ordinateur')
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'export-offer-close'
  close.textContent = '×'
  close.title = T('Close', 'Fermer')
  close.setAttribute('aria-label', close.title)
  root.append(label, get, close)
  container.append(root)

  let file = null
  get.addEventListener('click', () => {
    if (file) download(file.content, file.filename, file.type)
  })
  close.addEventListener('click', () => {
    root.hidden = true
    file = null
  })

  function show({ content, filename, type, savedOnServer }) {
    file = { content, filename, type }
    text.textContent = T(`AI exported ${filename}`, `L'IA a exporté ${filename}`)
    root.title = savedOnServer
      ? T(`Saved on the server: exports/${filename}`, `Enregistré sur le serveur : exports/${filename}`)
      : T('The file is downloaded only when you click Download.', 'Le fichier ne se télécharge que si tu cliques sur Télécharger.')
    root.hidden = false
  }

  return { show }
}
